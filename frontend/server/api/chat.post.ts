import { fetchRealFireData, fetchRealWaterData } from '../utils/realTimeData'

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
        throw createError({
            statusCode: 500,
            statusMessage: 'Gemini API Token not configured',
        })
    }

    // 1. Gather Real-Time Context
    let dashboardContext = ''
    try {
        const waterData = await fetchRealWaterData()
        const fireData = await fetchRealFireData()
        const { fetchAirQualityData } = await import('../utils/airQuality')
        const { fetchRealRainData } = await import('../utils/realTimeData')

        const aqiRaw = await fetchAirQualityData?.().catch(() => null)
        let aqiContext = '- ข้อมูลอากาศ (PM2.5): ไม่มีรายงานในขณะนี้'

        if (aqiRaw && aqiRaw.stations && aqiRaw.stations.length > 0) {
            const allAqi = aqiRaw.stations.map((s: any) => `${s.name} (AQI ${s.aqi || 0}, PM2.5 ${s.pm25 || 0})`).join(', ')
            aqiContext = `- ข้อมูลอากาศ (PM2.5) ทุกสถานี: ${allAqi}`
        }

        const rainRaw = await fetchRealRainData?.().catch(() => null)
        let rainContext = '- ข้อมูลฝนตก: ตอนนี้ยังไม่มีรายงานฝนตกหนักในพื้นที่เฝ้าระวัง'

        if (rainRaw && rainRaw.rainStations && rainRaw.rainStations.length > 0) {
            const allRain = rainRaw.rainStations.map((s: any) => `${s.province}-${s.amphoe} (${s.rain24h}mm)`).join(', ')
            rainContext = `- ข้อมูลพื้นที่ฝนตก (อ้างอิงรายอำเภอ เรียงจากตกหนักไปเบา): ${allRain}`
        }

        // Format water status
        const criticalStations = waterData.stations.filter((s: any) => s.riskLevel === 'danger')
        const warningStations = waterData.stations.filter((s: any) => s.riskLevel === 'warning')

        dashboardContext = `
[ข้อมูลภัยพิบัติปัจจุบัน (Real-time Context) - อ้างอิงข้อมูลด้านล่างให้ครบถ้วนเพื่อตอบคำถาม]
เวลาปัจจุบัน: ${new Date().toLocaleString('th-TH')}
- สถานการณ์น้ำ: สถานีวิกฤต (แดง) ${criticalStations.length} แห่ง, เฝ้าระวัง (เหลือง) ${warningStations.length} แห่ง
${criticalStations.length > 0 ? `  สถานีวิกฤตรุนแรง: ${criticalStations.map((s: any) => `${s.name} (${s.currentLevel.toFixed(2)}m)`).join(', ')}` : ''}
${warningStations.length > 0 ? `  สถานีเฝ้าระวัง: ${warningStations.map((s: any) => `${s.name} (${s.currentLevel.toFixed(2)}m)`).join(', ')}` : ''}
- สถานการณ์ไฟป่า (FIRMS): พบจุดความร้อนเสี่ยงในไทย ${fireData.activeCount} จุด
${fireData.fires && fireData.fires.length > 0 ? `  พิกัดไฟป่าทั้งหมดเรียงตามความรุนแรง (จังหวัด/อำเภอ): ${fireData.fires.slice(0, 100).map((f: any) => `${f.province || f.name} (ระดับ ${f.intensityLevel || f.intensity})`).join(', ')}` : ''}
${aqiContext}
${rainContext}
`
    } catch (e) {
        dashboardContext = "ระบบกำลังดึงข้อมูลเรียลไทม์ขัดข้อง แต่ยังให้คำแนะนำพื้นฐานได้"
        console.error("Context fetch error", e)
    }

    // 2. Formatting Prompt for Gemini
    const systemInstruction = `
คุณเป็น "Disaster AI Assistant" ผู้ช่วยอัจฉริยะสำหรับเว็บไซต์ Thailand Disaster Watch
หน้าที่ของคุณ:
1. ให้ข้อมูลและคำแนะนำเกี่ยวกับสถานการณ์น้ำท่วมและไฟป่าในประเทศไทย
2. ใช้อ้างอิงจาก [ข้อมูลภัยพิบัติปัจจุบัน] ที่ระบบส่งให้เสมอ ถ้าถามถึงสถานการณ์ตอนนี้
3. ตอบกระชับ เข้าใจง่าย ใช้ภาษาไทยที่สุภาพและเป็นมืออาชีพ
4. ใช้ \`Markdown\` ในการจัดรูปแบบข้อความ เช่น **ตัวหนา** สำหรับเรื่องสำคัญ และทำเป็นลิสต์เพื่อให้อ่านง่าย
5. หากผู้ใช้ถามเรื่องที่ไม่เกี่ยวกับภัยพิบัติ, สภาพอากาศ, น้ำท่วม, ไฟป่า หรือ PM2.5 ให้ตอบปัดอย่างสุภาพว่า "ผมเป็น AI ผู้ช่วยด้านภัยพิบัติ ขออนุญาตให้ข้อมูลเฉพาะเรื่องที่เกี่ยวข้องกับฝน น้ำท่วม ไฟป่า และคุณภาพอากาศนะครับ"
`

    // Build conversation history format for Gemini
    let contents = []

    // Add history
    for (const msg of history) {
        if (msg.role === 'user' || msg.role === 'assistant') {
            contents.push({
                role: msg.role === 'assistant' ? 'model' : 'user',
                parts: [{ text: msg.content }]
            })
        }
    }

    // Add new user message with context
    contents.push({
        role: 'user',
        parts: [{ text: `${systemInstruction}\n\n${dashboardContext}\n\nคำถามล่าสุดจากผู้ใช้: ${userMessage}` }]
    })

    // 3. Call Gemini API
    try {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`

        const response: any = await $fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: {
                contents: contents,
                generationConfig: {
                    temperature: 0.2, // Low temp for factual responses
                    maxOutputTokens: 1500,
                }
            }
        })

        const answer = response.candidates?.[0]?.content?.parts?.[0]?.text || "ขออภัยครับ AI ไม่สามารถตอบกลับได้ในขณะนี้"

        return { response: answer }

    } catch (error: any) {
        console.error("Gemini API Error:", error.data || error.message || error)
        throw createError({
            statusCode: 500,
            statusMessage: 'Failed to communicate with AI',
        })
    }
})
