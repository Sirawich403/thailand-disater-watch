export default defineEventHandler(async (event) => {
    const body = await readBody(event)
    const userMessage = body?.message
    const history = body?.history || []
    const dashboardContext = body?.context || '' // Accept context from frontend

    if (!userMessage) {
        return { response: 'กรุณาพิมพ์ข้อความก่อนครับ' }
    }

    const config = useRuntimeConfig()
    const apiKey = config.geminiApiToken

    if (!apiKey) {
        console.error('[Chat] GEMINI_API_TOKEN not set')
        // If no API key, try local response from context data
        if (dashboardContext) {
            return { response: generateLocalResponse(userMessage, dashboardContext) }
        }
        return { response: 'ระบบ AI ยังไม่ได้ตั้งค่า กรุณาแจ้งผู้ดูแลระบบครับ' }
    }

    // Build prompt
    const systemInstruction = `คุณเป็น "Disaster AI Assistant" ผู้ช่วยอัจฉริยะสำหรับเว็บไซต์ Thailand Disaster Watch
หน้าที่ของคุณ:
1. ให้ข้อมูลและคำแนะนำเกี่ยวกับสถานการณ์น้ำท่วมและไฟป่าในประเทศไทย
2. ใช้อ้างอิงจาก [ข้อมูลภัยพิบัติปัจจุบัน] ที่ระบบส่งให้เสมอ ถ้าถามถึงสถานการณ์ตอนนี้
3. ตอบกระชับ เข้าใจง่าย ใช้ภาษาไทยที่สุภาพและเป็นมืออาชีพ
4. ใช้ Markdown เช่น **ตัวหนา** สำหรับเรื่องสำคัญ และทำเป็นลิสต์เพื่อให้อ่านง่าย
5. หากผู้ใช้ถามเรื่องที่ไม่เกี่ยวกับภัยพิบัติ ให้ตอบปัดอย่างสุภาพ`

    let historyText = ''
    if (history?.length > 0) {
        const recent = history.slice(-4)
        historyText = '[ประวัติการสนทนา]\n' + recent.map((m: any) => `${m.role === 'user' ? 'User' : 'AI'}: ${m.content}`).join('\n') + '\n\n'
    }

    const fullPrompt = `${systemInstruction}\n\n${dashboardContext}\n\n${historyText}คำถามล่าสุดจากผู้ใช้: ${userMessage}`

    // Call Gemini API with retry on 429
    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`
    const maxRetries = 3
    const delays = [1500, 3000, 5000] // backoff delays in ms

    for (let attempt = 0; attempt < maxRetries; attempt++) {
        try {
            console.log(`[Chat] Gemini attempt ${attempt + 1}/${maxRetries}`)

            const controller = new AbortController()
            const timeout = setTimeout(() => controller.abort(), 12000)

            const res = await fetch(geminiUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    contents: [{ role: 'user', parts: [{ text: fullPrompt }] }],
                    generationConfig: { temperature: 0.3, maxOutputTokens: 1024 }
                }),
                signal: controller.signal,
            })

            clearTimeout(timeout)

            if (res.status === 429) {
                console.warn(`[Chat] Rate limited (429), retry in ${delays[attempt]}ms...`)
                if (attempt < maxRetries - 1) {
                    await new Promise(r => setTimeout(r, delays[attempt]))
                    continue
                }
                // All retries exhausted — fallback to local
                console.warn('[Chat] All retries exhausted, using local fallback')
                return { response: generateLocalResponse(userMessage, dashboardContext) }
            }

            if (!res.ok) {
                const errText = await res.text().catch(() => '')
                console.error(`[Chat] Gemini error ${res.status}:`, errText.substring(0, 200))
                return { response: generateLocalResponse(userMessage, dashboardContext) }
            }

            const data = await res.json()
            const answer = data?.candidates?.[0]?.content?.parts?.[0]?.text

            if (answer) {
                console.log('[Chat] Gemini answered, length:', answer.length)
                return { response: answer }
            }

            // Empty answer — fallback
            return { response: generateLocalResponse(userMessage, dashboardContext) }

        } catch (error: any) {
            if (error.name === 'AbortError') {
                console.error('[Chat] Timeout on attempt', attempt + 1)
            } else {
                console.error('[Chat] Error on attempt', attempt + 1, ':', error.message)
            }
            if (attempt === maxRetries - 1) {
                return { response: generateLocalResponse(userMessage, dashboardContext) }
            }
        }
    }

    return { response: generateLocalResponse(userMessage, dashboardContext) }
})

/**
 * Generate a response locally from dashboard data — no AI needed.
 * This is the fallback when Gemini is unavailable (rate limited, timeout, etc.)
 */
function generateLocalResponse(question: string, context: string): string {
    const q = question.toLowerCase()

    // Parse context sections
    const lines = context.split('\n').filter(l => l.trim())

    // Extract key data from context
    const waterLine = lines.find(l => l.includes('สถานการณ์น้ำ') || l.includes('สถานี'))
    const fireLine = lines.find(l => l.includes('ไฟป่า') || l.includes('จุดความร้อน'))
    const aqiLine = lines.find(l => l.includes('PM2.5') || l.includes('AQI') || l.includes('คุณภาพอากาศ'))
    const rainLine = lines.find(l => l.includes('ฝนตก') || l.includes('ฝน'))
    const criticalLine = lines.find(l => l.includes('สถานีวิกฤต'))
    const warningLine = lines.find(l => l.includes('สถานีเฝ้าระวัง'))
    const firePlaces = lines.find(l => l.includes('จุดไฟป่า'))

    // PM2.5 / AQI / ฝุ่น questions
    if (q.includes('pm2.5') || q.includes('pm 2.5') || q.includes('ฝุ่น') || q.includes('อากาศ') || q.includes('aqi') || q.includes('คุณภาพอากาศ')) {
        if (aqiLine) {
            return `📊 **ข้อมูลคุณภาพอากาศตอนนี้**\n\n${aqiLine.replace(/^-\s*/, '')}\n\n> ข้อมูลจาก AQICN (World Air Quality Index) อัปเดตแบบเรียลไทม์`
        }
        return '📊 ขณะนี้ยังไม่มีข้อมูลคุณภาพอากาศ กรุณาลองใหม่ภายหลังครับ'
    }

    // Rain / ฝน questions
    if (q.includes('ฝน') || q.includes('ฝนตก') || q.includes('rain')) {
        if (rainLine) {
            return `🌧️ **ข้อมูลฝนตก 24 ชม. ล่าสุด**\n\n${rainLine.replace(/^-\s*/, '')}\n\n> ข้อมูลจาก ThaiWater API (สถาบันสารสนเทศทรัพยากรน้ำ)`
        }
        return '🌧️ ขณะนี้ยังไม่มีรายงานฝนตกหนักในพื้นที่เฝ้าระวังครับ'
    }

    // Fire / ไฟป่า questions
    if (q.includes('ไฟ') || q.includes('ไฟป่า') || q.includes('fire') || q.includes('จุดความร้อน') || q.includes('hotspot')) {
        let result = '🔥 **สถานการณ์ไฟป่าล่าสุด**\n\n'
        if (fireLine) result += fireLine.replace(/^-\s*/, '') + '\n'
        if (firePlaces) result += '\n' + firePlaces.trim() + '\n'
        result += '\n> ข้อมูลจาก NASA FIRMS (ดาวเทียม VIIRS) อัปเดตทุก 2-3 ชม.'
        return result
    }

    // Water / น้ำท่วม questions
    if (q.includes('น้ำ') || q.includes('น้ำท่วม') || q.includes('ระดับน้ำ') || q.includes('flood') || q.includes('water')) {
        let result = '💧 **สถานการณ์น้ำล่าสุด**\n\n'
        if (waterLine) result += waterLine.replace(/^-\s*/, '') + '\n'
        if (criticalLine) result += '\n' + criticalLine.trim() + '\n'
        if (warningLine) result += '\n' + warningLine.trim() + '\n'
        result += '\n> ข้อมูลจาก ThaiWater API อัปเดตแบบเรียลไทม์'
        return result
    }

    // Province-specific questions
    const provinces = ['กรุงเทพ', 'เชียงใหม่', 'เชียงราย', 'ลำปาง', 'แม่ฮ่องสอน', 'ขอนแก่น', 'นครราชสีมา', 'สงขลา', 'ภูเก็ต', 'สุราษฎร์ธานี', 'อุดรธานี', 'นครสวรรค์', 'ระยอง', 'สระบุรี', 'ลำพูน', 'นนทบุรี', 'ปทุมธานี', 'สมุทรปราการ']
    const matchedProvince = provinces.find(p => q.includes(p.toLowerCase()) || q.includes(p))

    if (matchedProvince) {
        let result = `📍 **ข้อมูลของ ${matchedProvince}**\n\n`
        let found = false

        // Check if province appears in any context line
        for (const line of lines) {
            if (line.includes(matchedProvince)) {
                result += '- ' + line.trim() + '\n'
                found = true
            }
        }

        if (!found) {
            result += `ขณะนี้ไม่พบข้อมูลเฝ้าระวังเฉพาะพื้นที่ ${matchedProvince}\n`
            if (aqiLine && aqiLine.includes(matchedProvince)) {
                result += '\n' + aqiLine.trim() + '\n'
            }
        }

        result += '\n> ข้อมูลจากแดชบอร์ด Thailand Disaster Watch'
        return result
    }

    // General / สถานการณ์ overview
    if (q.includes('สรุป') || q.includes('ภาพรวม') || q.includes('สถานการณ์') || q.includes('ตอนนี้') || q.includes('วันนี้') || q.includes('ล่าสุด') || q.length < 15) {
        let result = '🛡️ **สรุปสถานการณ์ภัยพิบัติล่าสุด**\n\n'
        if (waterLine) result += '- ' + waterLine.replace(/^-\s*/, '') + '\n'
        if (fireLine) result += '- ' + fireLine.replace(/^-\s*/, '') + '\n'
        if (aqiLine) result += '- ' + aqiLine.replace(/^-\s*/, '') + '\n'
        if (rainLine) result += '- ' + rainLine.replace(/^-\s*/, '') + '\n'
        if (!waterLine && !fireLine && !aqiLine && !rainLine) {
            result += 'ขณะนี้ยังไม่มีข้อมูลเรียลไทม์ กรุณาลองใหม่ภายหลังครับ\n'
        }
        result += '\n> ข้อมูลจากระบบ Thailand Disaster Watch อัปเดตแบบเรียลไทม์'
        return result
    }

    // Default — show overview
    let result = '🛡️ **ข้อมูลจากระบบเฝ้าระวังภัยพิบัติ**\n\n'
    if (waterLine) result += '- ' + waterLine.replace(/^-\s*/, '') + '\n'
    if (fireLine) result += '- ' + fireLine.replace(/^-\s*/, '') + '\n'
    if (aqiLine) result += '- ' + aqiLine.replace(/^-\s*/, '') + '\n'
    if (rainLine) result += '- ' + rainLine.replace(/^-\s*/, '') + '\n'
    result += '\nลองถามเฉพาะเจาะจงได้ เช่น **"PM2.5 เชียงใหม่"**, **"จังหวัดไหนฝนตก"**, **"สถานการณ์ไฟป่า"** ครับ'
    return result
}
