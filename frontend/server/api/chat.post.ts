import { fetchRealFireData, fetchRealWaterData, fetchRealRainData } from '../utils/realTimeData'
import { fetchAirQualityData } from '../utils/airQuality'

export default defineEventHandler(async (event) => {
    const body = await readBody(event)
    const userMessage = body?.message
    const history = body?.history || []

    if (!userMessage) {
        throw createError({
            statusCode: 400,
            statusMessage: 'Message is required',
        })
    }

    const config = useRuntimeConfig()
    const apiKey = config.geminiApiToken

    if (!apiKey) {
        console.error('[Chat] GEMINI_API_TOKEN is not set!')
        return { response: 'ระบบยังไม่ได้ตั้งค่า API Key สำหรับ AI กรุณาแจ้งผู้ดูแลระบบครับ ⚠️' }
    }

    // 1. Gather Real-Time Context — ALL in parallel, with individual catch
    let dashboardContext = ''
    try {
        const [waterResult, fireResult, aqiResult, rainResult] = await Promise.allSettled([
            fetchRealWaterData().catch(() => null),
            fetchRealFireData().catch(() => null),
            fetchAirQualityData().catch(() => null),
            fetchRealRainData().catch(() => null),
        ])

        const waterData = waterResult.status === 'fulfilled' ? waterResult.value : null
        const fireData = fireResult.status === 'fulfilled' ? fireResult.value : null
        const aqiRaw = aqiResult.status === 'fulfilled' ? aqiResult.value : null
        const rainRaw = rainResult.status === 'fulfilled' ? rainResult.value : null

        console.log('[Chat] Data fetch results:', {
            water: waterData ? 'OK' : 'FAIL',
            fire: fireData ? 'OK' : 'FAIL',
            aqi: aqiRaw ? 'OK' : 'FAIL',
            rain: rainRaw ? 'OK' : 'FAIL',
        })

        // Build water context
        let waterContext = '- สถานการณ์น้ำ: ไม่มีข้อมูลในขณะนี้'
        if (waterData?.stations?.length > 0) {
            const criticalStations = waterData.stations.filter((s: any) => s.riskLevel === 'danger' || s.riskLevel === 'critical') || []
            const warningStations = waterData.stations.filter((s: any) => s.riskLevel === 'warning') || []
            waterContext = `- สถานการณ์น้ำ: สถานีวิกฤต ${criticalStations.length} แห่ง, เฝ้าระวัง ${warningStations.length} แห่ง`
            if (criticalStations.length > 0) {
                waterContext += `\n  สถานีวิกฤต: ${criticalStations.slice(0, 10).map((s: any) => `${s.name} (${s.currentLevel?.toFixed?.(2) || '?'}m, ${s.description || ''})`).join(', ')}`
            }
            if (warningStations.length > 0) {
                waterContext += `\n  สถานีเฝ้าระวัง: ${warningStations.slice(0, 10).map((s: any) => `${s.name} (${s.currentLevel?.toFixed?.(2) || '?'}m, ${s.description || ''})`).join(', ')}`
            }
        }

        // Build fire context
        let fireContext = '- สถานการณ์ไฟป่า: ไม่มีข้อมูลในขณะนี้'
        if (fireData?.fires?.length > 0 || fireData?.activeCount != null) {
            fireContext = `- สถานการณ์ไฟป่า (FIRMS): พบจุดความร้อนในไทย ${fireData.activeCount || 0} จุด`
            if (fireData.fires?.length > 0) {
                fireContext += `\n  จุดไฟป่า: ${fireData.fires.slice(0, 20).map((f: any) => `${f.province || f.name} (ระดับ ${f.intensity || f.intensityLevel})`).join(', ')}`
            }
        }

        // Build AQI context
        let aqiContext = '- คุณภาพอากาศ (PM2.5): ไม่มีข้อมูลในขณะนี้'
        if (aqiRaw?.stations?.length > 0) {
            aqiContext = `- คุณภาพอากาศ (PM2.5): ${aqiRaw.stations.slice(0, 15).map((s: any) => `${s.name} (AQI ${s.aqi || 0}, PM2.5 ${s.pm25 || '-'})`).join(', ')}`
        }

        // Build rain context
        let rainContext = '- ข้อมูลฝนตก: ไม่มีรายงานฝนตกหนัก'
        if (rainRaw?.rainStations?.length > 0) {
            rainContext = `- ข้อมูลฝนตก (เรียงจากหนัก→เบา): ${rainRaw.rainStations.slice(0, 20).map((s: any) => `${s.province}-${s.amphoe} (${s.rain24h}mm)`).join(', ')}`
        }

        dashboardContext = `
[ข้อมูลภัยพิบัติปัจจุบัน (Real-time)]
เวลา: ${new Date().toLocaleString('th-TH')}
${waterContext}
${fireContext}
${aqiContext}
${rainContext}
`
    } catch (e: any) {
        console.error('[Chat] Context fetch error:', e?.message || e)
        dashboardContext = 'ระบบกำลังดึงข้อมูลเรียลไทม์ขัดข้อง แต่ยังให้คำแนะนำพื้นฐานได้'
    }

    // 2. Build Gemini prompt
    const systemInstruction = `
คุณเป็น "Disaster AI Assistant" ผู้ช่วยอัจฉริยะสำหรับเว็บไซต์ Thailand Disaster Watch
หน้าที่ของคุณ:
1. ให้ข้อมูลและคำแนะนำเกี่ยวกับสถานการณ์น้ำท่วมและไฟป่าในประเทศไทย
2. ใช้อ้างอิงจาก [ข้อมูลภัยพิบัติปัจจุบัน] ที่ระบบส่งให้เสมอ ถ้าถามถึงสถานการณ์ตอนนี้
3. ตอบกระชับ เข้าใจง่าย ใช้ภาษาไทยที่สุภาพและเป็นมืออาชีพ
4. ใช้ Markdown ในการจัดรูปแบบข้อความ เช่น **ตัวหนา** สำหรับเรื่องสำคัญ และทำเป็นลิสต์เพื่อให้อ่านง่าย
5. หากผู้ใช้ถามเรื่องที่ไม่เกี่ยวกับภัยพิบัติ, สภาพอากาศ, น้ำท่วม, ไฟป่า หรือ PM2.5 ให้ตอบปัดอย่างสุภาพว่า "ผมเป็น AI ผู้ช่วยด้านภัยพิบัติ ขออนุญาตให้ข้อมูลเฉพาะเรื่องที่เกี่ยวข้องกับฝน น้ำท่วม ไฟป่า และคุณภาพอากาศนะครับ"
`

    let historyText = ''
    if (history?.length > 0) {
        const recentHistory = history.slice(-6) // Keep only last 6 messages to save tokens
        historyText = '[ประวัติการสนทนา]\n' + recentHistory.map((m: any) => `${m.role === 'user' ? 'User' : 'AI'}: ${m.content}`).join('\n') + '\n\n'
    }

    const fullPrompt = `${systemInstruction}\n\n${dashboardContext}\n\n${historyText}คำถามล่าสุดจากผู้ใช้: ${userMessage}`

    // 3. Call Gemini API using native fetch (not $fetch) for better error control
    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`

    try {
        console.log('[Chat] Calling Gemini API, prompt length:', fullPrompt.length)

        const controller = new AbortController()
        const timeout = setTimeout(() => controller.abort(), 15000) // 15s timeout

        const geminiResponse = await fetch(geminiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{ role: 'user', parts: [{ text: fullPrompt }] }],
                generationConfig: {
                    temperature: 0.3,
                    maxOutputTokens: 1024,
                }
            }),
            signal: controller.signal,
        })

        clearTimeout(timeout)

        const responseText = await geminiResponse.text()

        if (!geminiResponse.ok) {
            console.error('[Chat] Gemini API error:', geminiResponse.status, responseText.substring(0, 300))
            return { response: `ระบบ AI ขัดข้อง (${geminiResponse.status}) กรุณาลองใหม่อีกครั้งครับ ⚠️` }
        }

        const data = JSON.parse(responseText)
        const answer = data?.candidates?.[0]?.content?.parts?.[0]?.text

        if (!answer) {
            console.error('[Chat] No answer in Gemini response:', responseText.substring(0, 300))
            return { response: 'AI ไม่สามารถประมวลผลได้ในขณะนี้ กรุณาลองถามใหม่อีกครั้งครับ' }
        }

        console.log('[Chat] Success! Answer length:', answer.length)
        return { response: answer }

    } catch (error: any) {
        if (error.name === 'AbortError') {
            console.error('[Chat] Gemini API timed out (15s)')
            return { response: 'AI ใช้เวลาตอบนานเกินไป กรุณาลองใหม่อีกครั้งครับ ⏱️' }
        }
        console.error('[Chat] Unexpected error:', error?.message || error)
        return { response: 'ระบบ AI ขัดข้องชั่วคราว กรุณาลองใหม่อีกครั้งครับ ⚠️' }
    }
})
