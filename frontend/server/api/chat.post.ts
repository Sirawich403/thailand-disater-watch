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
    const systemInstruction = `คุณคือ "Disaster AI Assistant" ผู้ช่วยอัจฉริยะสุดใจดีสำหรับเว็บไซต์ Thailand Disaster Watch
หน้าที่ของคุณ:
1. ให้ข้อมูลและคำแนะนำเกี่ยวกับสถานการณ์น้ำท่วม ไฟป่า ฝุ่น PM2.5 และฝนตกในประเทศไทย
2. ตอบคำถามอย่างเป็นธรรมชาติ เหมือนคนคุยกัน (Conversational AI) ไม่เอาแบบหุ่นยนต์ หรือก็อปปี้ลิสต์ข้อมูลมาแปะทื่อๆ
3. ใช้ข้อมูลจาก [ข้อมูลภัยพิบัติปัจจุบัน] ที่ระบบส่งให้เสมอ สรุปใจความสำคัญให้เข้าใจง่าย นำเสนอแบบเล่าเรื่องหรืออธิบาย
4. ใช้ภาษาไทยที่สุภาพ เป็นมิตร กระตือรือร้น (ใช้คำลงท้าย ครับ/ค่ะ สลับกันไปตามเหมาะสม หรือใช้อีโมจิช่วยสื่ออารมณ์ 🌟🌧️🔥)
5. ใช้ Markdown เช่น **ตัวหนา** สำหรับเน้นคำสำคัญ หรือทำ List สั้นๆ ให้อ่านง่าย
6. หากผู้ใช้ถามเรื่องทั่วไปที่นอกเหนือจากภัยพิบัติ สามารถคุยเล่นได้นิดหน่อยแล้วค่อยวกกลับมาเรื่องภัยพิบัติอย่างสุภาพ`

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

    // Helper to extract specific text after a colon or dash
    const cleanLine = (line: string | undefined) => line ? line.replace(/^-\s*/, '').replace(/.*:/, '').trim() : ''

    // PM2.5 / AQI / ฝุ่น questions
    if (q.includes('pm2.5') || q.includes('pm 2.5') || q.includes('ฝุ่น') || q.includes('อากาศ') || q.includes('aqi') || q.includes('คุณภาพอากาศ')) {
        if (aqiLine) {
            return `ตอนนี้ข้อมูลฝุ่น PM2.5 ทั่วประเทศอยู่ที่ระดับนี้ค่ะ 😷\n\n**${cleanLine(aqiLine)}**\n\nถ้าอยู่ในพื้นที่ที่ค่าฝุ่นสูง อย่าลืมสวมหน้ากาก N95 ก่อนออกจากบ้านนะคะ ดูแลสุขภาพด้วยค่ะ! 🍃`
        }
        return 'ขออภัยด้วยค่ะ ตอนนี้ระบบยังดึงข้อมูลดัชนีคุณภาพอากาศ (AQI) ล่าสุดไม่ได้เลยค่ะ ลองถามเข้ามาใหม่สักพักนะคะ 🙏'
    }

    // Rain / ฝน questions
    if (q.includes('ฝน') || q.includes('ฝนตก') || q.includes('rain')) {
        if (rainLine) {
            return `เรื่องฝนตกเหรอคะ? จากรายงานล่าสุดในรอบ 24 ชั่วโมงที่ผ่านมา 🌧️\n\n**${cleanLine(rainLine)}**\n\nพื้นที่ที่ฝนตกหนัก ระวังเรื่องน้ำท่วมฉับพลันด้วยนะคะ พกร่มติดตัวไว้ด้วยน้า ☂️`
        }
        return 'ตอนนี้ยังไม่มีรายงานฝนตกหนักในพื้นที่เฝ้าระวังเลยค่ะ แดดน่าจะออกเคลียร์ๆ เลย ☀️'
    }

    // Fire / ไฟป่า questions
    if (q.includes('ไฟ') || q.includes('ไฟป่า') || q.includes('fire') || q.includes('จุดความร้อน') || q.includes('hotspot')) {
        let result = `อัปเดตสถานการณ์ไฟป่าจากดาวเทียม NASA ล่าสุดนะคะ 🔥\n\n**${cleanLine(fireLine) || 'ไม่พบสัญญาณไฟในจุดเฝ้าระวังหลัก'}**\n`
        if (firePlaces) result += `\nพื้นที่ที่พบส่วนใหญ่คือ: ${cleanLine(firePlaces)}\n`
        result += '\nช่วงนี้อากาศแห้ง ระวังเรื่องการลุกไหม้ และฝุ่นควันจากไฟป่าด้วยนะคะ 🌲'
        return result
    }

    // Water / น้ำท่วม questions
    if (q.includes('น้ำ') || q.includes('น้ำท่วม') || q.includes('ระดับน้ำ') || q.includes('flood') || q.includes('water')) {
        let result = `รายงานสดเรื่องสถานการณ์น้ำท่วมและระดับน้ำในแม่น้ำสายหลักค่ะ 💧\n\n**${cleanLine(waterLine)}**\n`
        if (criticalLine) result += `\n🚨 อัปเดตจุดวิกฤต: ${cleanLine(criticalLine)}`
        if (warningLine) result += `\n⚠️ จุดเฝ้าระวัง: ${cleanLine(warningLine)}`
        result += '\n\nถ้าอยู่ในพื้นที่เสี่ยงรบกวนติดตามข่าวสารอย่างใกล้ชิด และเตรียมเก็บของขึ้นที่สูงด้วยนะคะ 💙'
        return result
    }

    // Province-specific questions
    const provinces = ['กรุงเทพ', 'เชียงใหม่', 'เชียงราย', 'ลำปาง', 'แม่ฮ่องสอน', 'ขอนแก่น', 'นครราชสีมา', 'สงขลา', 'ภูเก็ต', 'สุราษฎร์ธานี', 'อุดรธานี', 'นครสวรรค์', 'ระยอง', 'สระบุรี', 'ลำพูน', 'นนทบุรี', 'ปทุมธานี', 'สมุทรปราการ']
    const matchedProvince = provinces.find(p => q.includes(p.toLowerCase()) || q.includes(p))

    if (matchedProvince) {
        let result = `📍 สรุปสถานการณ์สำหรับ **${matchedProvince}** ค่ะ:\n\n`
        let count = 0

        // Search for data mentioning the province
        for (const line of lines) {
            if (line.includes(matchedProvince)) {
                result += `- ${cleanLine(line)}\n`
                count++
            }
        }

        if (count === 0) {
            result += `ดีกรีความปลอดภัยยังสูงอยู่ค่ะ ตอนนี้ยังไม่มีรายงานน้ำท่วม ฝนตกหนัก หรือพิกัดไฟป่าที่น่าเป็นห่วงใน ${matchedProvince} 🎉\n`
            if (aqiLine && aqiLine.includes(matchedProvince)) {
                result += `\nส่วนเรื่องอากาศ: ${cleanLine(aqiLine)}\n`
            }
        }

        result += '\nดูแลตัวเองด้วยนะคะ มีอะไรถามเพิ่มได้เลย 🌟'
        return result
    }

    // Greeting / Chitchat
    if (q.includes('สวัสดี') || q.includes('ดีครับ') || q.includes('ดีจ้า') || q.includes('ทำอะไรได้บ้าง') || q.includes('คืออะไร')) {
        return `สวัสดีค่ะ! 👋 ฉันคือผู้ช่วย AI จาก **Thailand Disaster Watch** ค่ะ 🇹🇭\n\nฉันสามารถช่วยรายงานสรุป หรือตอบคำถามเกี่ยวกับภัยพิบัติต่างๆ ได้ เช่น:\n- 🌧️ ปริมาณฝนตก\n- 💧 ระดับน้ำ หรือสถานการณ์น้ำท่วม\n- 🔥 พิพัดความร้อนและจุดไฟป่า\n- 💨 ตรวจสอบคุณภาพอากาศ (PM2.5)\n\nลองพิมพ์ชื่อจังหวัดที่คุณอยู่ หรือถามว่า "สรุปภาพรวมวันนี้ให้ฟังหน่อย" ดูสิคะ 😊`
    }

    // General / สถานการณ์ overview
    if (q.includes('สรุป') || q.includes('ภาพรวม') || q.includes('สถานการณ์') || q.includes('ตอนนี้') || q.includes('วันนี้') || q.includes('ล่าสุด') || q.length < 15) {
        let result = 'นี่คือสรุปภาพรวมสถานการณ์ระบบเฝ้าระวังทั่วประเทศล่าสุดค่ะ 🌍✨\n\n'
        if (waterLine) result += `💧 **เรื่องน้ำ:** ${cleanLine(waterLine)}\n`
        if (fireLine) result += `🔥 **เรื่องไฟ:** ${cleanLine(fireLine)}\n`
        if (aqiLine) result += `💨 **เรื่องอากาศ (PM2.5):** ${cleanLine(aqiLine)}\n`
        if (rainLine) result += `🌧️ **เรื่องฝน:** ${cleanLine(rainLine)}\n`

        if (!waterLine && !fireLine && !aqiLine && !rainLine) {
            result += 'ตอนนี้ระบบข้อมูลกำลังอัปเดตอยู่นะคะ อาจจะต้องรอสักแปปนึง ⏳\n'
        }

        result += '\nข้อมูลนี้อัปเดตแบบเรียลไทม์เลยนะคะ อยากให้เจาะจงที่จังหวัดไหนเป็นพิเศษไหมคะ? พิมพ์บอกมาได้เลย 💬'
        return result
    }

    // Default catch-all (Chatty and encouraging)
    return `รับทราบค่ะ! 🌟 แต่เพื่อให้ฉันช่วยหาข้อมูลได้ตรงประเด็นมากขึ้น รบกวนระบุสิ่งที่อยากรู้เพิ่มอีกนิดนะคะ เช่น ลองถามว่า:\n\n- "PM2.5 เชียงใหม่ตอนนี้เป็นไงบ้าง"\n- "ที่ขอนแก่นฝนตกไหม"\n- "สรุปสถานการณ์ระดับน้ำล่าสุดหน่อย"\n\nยินดีให้บริการเสมอค่ะ! 💙`
}
