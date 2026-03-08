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
            return { response: await generateLocalResponse(userMessage, dashboardContext) }
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
                return { response: await generateLocalResponse(userMessage, dashboardContext) }
            }

            if (!res.ok) {
                const errText = await res.text().catch(() => '')
                console.error(`[Chat] Gemini error ${res.status}:`, errText.substring(0, 200))
                return { response: await generateLocalResponse(userMessage, dashboardContext) }
            }

            const data = await res.json()
            const answer = data?.candidates?.[0]?.content?.parts?.[0]?.text

            if (answer) {
                console.log('[Chat] Gemini answered, length:', answer.length)
                return { response: answer }
            }

            // Empty answer — fallback
            return { response: await generateLocalResponse(userMessage, dashboardContext) }

        } catch (error: any) {
            if (error.name === 'AbortError') {
                console.error('[Chat] Timeout on attempt', attempt + 1)
            } else {
                console.error('[Chat] Error on attempt', attempt + 1, ':', error.message)
            }
            if (attempt === maxRetries - 1) {
                return { response: await generateLocalResponse(userMessage, dashboardContext) }
            }
        }
    }

    return { response: await generateLocalResponse(userMessage, dashboardContext) }
})

/**
 * Generate a response locally from dashboard data — no AI needed.
 * This is the fallback when Gemini is unavailable (rate limited, timeout, etc.)
 */
async function generateLocalResponse(question: string, context: string): Promise<string> {
    const q = question.toLowerCase()

    // 1. Province-specific analysis (Requires fetching raw data for accuracy)
    const PROVINCES = [
        'กรุงเทพมหานคร', 'กระบี่', 'กาญจนบุรี', 'กาฬสินธุ์', 'กำแพงเพชร', 'ขอนแก่น', 'จันทบุรี', 'ฉะเชิงเทรา', 'ชลบุรี', 'ชัยนาท',
        'ชัยภูมิ', 'ชุมพร', 'เชียงราย', 'เชียงใหม่', 'ตรัง', 'ตราด', 'ตาก', 'นครนายก', 'นครปฐม', 'นครพนม',
        'นครราชสีมา', 'นครศรีธรรมราช', 'นครสวรรค์', 'นนทบุรี', 'นราธิวาส', 'น่าน', 'บึงกาฬ', 'บุรีรัมย์', 'ปทุมธานี', 'ประจวบคีรีขันธ์',
        'ปราจีนบุรี', 'ปัตตานี', 'พระนครศรีอยุธยา', 'พังงา', 'พัทลุง', 'พิจิตร', 'พิษณุโลก', 'เพชรบุรี', 'เพชรบูรณ์', 'แพร่',
        'ภูเก็ต', 'มหาสารคาม', 'มุกดาหาร', 'แม่ฮ่องสอน', 'ยโสธร', 'ยะลา', 'ร้อยเอ็ด', 'ระนอง', 'ระยอง', 'ราชบุรี',
        'ลพบุรี', 'ลำปาง', 'ลำพูน', 'เลย', 'ศรีสะเกษ', 'สกลนคร', 'สงขลา', 'สตูล', 'สมุทรปราการ', 'สมุทรสงคราม',
        'สมุทรสาคร', 'สระแก้ว', 'สระบุรี', 'สิงห์บุรี', 'สุโขทัย', 'สุพรรณบุรี', 'สุราษฎร์ธานี', 'สุรินทร์', 'หนองคาย', 'หนองบัวลำภู',
        'อ่างทอง', 'อุดรธานี', 'อุทัยธานี', 'อุตรดิตถ์', 'อุบลราชธานี', 'อำนาจเจริญ', 'กรุงเทพ'
    ]

    const matchedProvinceObj = PROVINCES.find(p => q.includes(p) || q.includes(p.replace('มหานคร', '')))

    if (matchedProvinceObj) {
        const matchedProvince = matchedProvinceObj.replace('มหานคร', '')
        let isRain = q.includes('ฝน') || q.includes('rain')
        let isAqi = q.includes('pm2.5') || q.includes('ฝุ่น') || q.includes('อากาศ') || q.includes('aqi')
        let isFire = q.includes('ไฟ') || q.includes('fire')
        let isWater = q.includes('น้ำท่วม') || q.includes('น้ำ') || q.includes('ระดับน้ำ')

        try {
            // Fetch raw data using local internal fetch
            const [summary, fireData, aqiData, rainData] = await Promise.allSettled([
                $fetch('/api/dashboard/summary'),
                $fetch('/api/dashboard/fires'),
                $fetch('/api/dashboard/aqi'),
                $fetch('/api/dashboard/rain'),
            ])

            if (isRain) {
                const data = rainData.status === 'fulfilled' ? (rainData.value as any)?.rainStations || [] : []
                const provRain = data.filter((r: any) => r.province?.includes(matchedProvince))
                if (provRain.length > 0) {
                    const maxRain = Math.max(...provRain.map((r: any) => r.rain24h || 0))
                    let msg = `เรื่องฝนตกที่ **${matchedProvince}** ใช่ไหมคะ? 🌧️\n\nจากสถานีในจังหวัด รายงานปริมาณฝนสะสมสูงสุด 24 ชม. อยู่ที่ **${maxRain} mm** ค่ะ`
                    msg += maxRain > 35 ? ' ถือว่าตกหนักเลยนะคะ พกร่มและระวังน้ำขังด้วย ☂️' : ' ไม่ค่อยหนักเท่าไหร่ค่ะ 🌤️'
                    return msg
                } else {
                    return `ตอนนี้ที่ **${matchedProvince}** ยังไม่มีรายงานฝนตกหนักจากสถานีเลยค่ะ ท้องฟ้าน่าจะโปร่งใส ☀️`
                }
            }

            if (isAqi) {
                const data = aqiData.status === 'fulfilled' ? (aqiData.value as any)?.stations || [] : []
                const provAqi = data.filter((r: any) => r.name?.includes(matchedProvince) || r.nameEn?.toLowerCase().includes(matchedProvince.toLowerCase()))
                if (provAqi.length > 0) {
                    const maxAqi = Math.max(...provAqi.map((r: any) => r.aqi || 0))
                    let msg = `ที่ **${matchedProvince}** ค่า AQI อยู่ที่ประมาณ **${maxAqi}** ค่ะ 💨\n\n`
                    if (maxAqi > 100) msg += 'คุณภาพอากาศเริ่มมีผลกระทบต่อสุขภาพ อย่าลืมใส่หน้ากากนะคะ 😷'
                    else msg += 'อากาศยังอยู่ในเกณฑ์ดี หายใจสะดวกค่ะ 🍃'
                    return msg
                } else {
                    return `ยังไม่มีข้อมูลคุณภาพอากาศเป๊ะๆ ของ **${matchedProvince}** ในตอนนี้ค่ะ แต่ถ้าเริ่มมีหมอกควัน อย่าลืมใส่หน้ากากนะคะ 🙏`
                }
            }

            if (isFire) {
                const data = fireData.status === 'fulfilled' ? (fireData.value as any)?.fires || [] : []
                const provFire = data.filter((f: any) => (f.province && f.province.includes(matchedProvince)) || (f.name && f.name.includes(matchedProvince)))
                if (provFire.length > 0) {
                    return `อัปเดตไฟป่าที่ **${matchedProvince}** 🔥\n\nพบจุดความร้อนทั้งหมด **${provFire.length} จุด** ในระยะนี้ ระวังฝุ่นควันและผลกระทบด้วยนะคะ 🌲`
                } else {
                    return `ตอนนี้ยังไม่พบจุดพิกัดไฟป่ารุนแรงในพื้นที่ **${matchedProvince}** ค่ะ ปลอดภัยหายห่วง ✅`
                }
            }

            if (isWater) {
                const data = summary.status === 'fulfilled' ? (summary.value as any)?.stations || [] : []
                const provWater = data.filter((s: any) => (s.name && s.name.includes(matchedProvince)) || (s.description && s.description.includes(matchedProvince)))
                if (provWater.length > 0) {
                    const critical = provWater.filter((s: any) => s.riskLevel === 'danger' || s.riskLevel === 'critical')
                    const warning = provWater.filter((s: any) => s.riskLevel === 'warning')

                    if (critical.length > 0) {
                        const m = critical.slice(0, 3).map((s: any) => `${s.name} (${s.currentLevel?.toFixed(2)}m)`).join(', ')
                        return `🚨 ระดับน้ำที่ **${matchedProvince}** ค่อนข้างวิกฤตค่ะ!\nพบสถานีเสี่ยงน้ำล้นตลิ่ง: ${m}\nเตรียมรับมือและติดตามข่าวสารด้วยนะคะ 💧`
                    } else if (warning.length > 0) {
                        const m = warning.slice(0, 3).map((s: any) => `${s.name} (${s.currentLevel?.toFixed(2)}m)`).join(', ')
                        return `⚠️ ที่ **${matchedProvince}** ระดับน้ำบางจุดอยู่ในเกณฑ์เฝ้าระวังค่ะ เช่น ${m} ให้ระมัดระวังนิดนึงนะคะ`
                    } else {
                        return `ระดับน้ำในแม่น้ำสายสำคัญที่ **${matchedProvince}** ยังอยู่ในเกณฑ์ปกติค่ะ สบายใจได้เลย 🌊`
                    }
                } else {
                    return `ยังไม่มีสถานีรายงานความเสี่ยงระดับน้ำวิกฤตในพื้นที่ **${matchedProvince}** ณ ตอนนี้ค่ะ ✅`
                }
            }

            // General province query (no specific intent recognized, just summarize basic)
            return `📍 สรุปพิกัด **${matchedProvince}**:\nดีกรีความปลอดภัยภาพรวมสูงค่ะ ตอนนี้ระบบไม่ได้แจ้งเตือนระดับวิกฤตที่น่ากังวลนะคะ 🌟\n\nอยากทราบข้อมูลเจาะจงของที่นี่ เช่น พิมพ์ว่า "PM2.5 ที่นี่" หรือ "ระดับน้ำ" ได้เลยค่ะ!`

        } catch (e) {
            console.error('[Chat] Failed to fetch context for province', e)
        }
    }

    // Parse generic context string safely
    const lines = context ? context.split('\n').filter(l => l.trim()) : []
    const waterLine = lines.find(l => l.includes('สถานการณ์น้ำ') || l.includes('สถานี'))
    const fireLine = lines.find(l => l.includes('ไฟป่า') || l.includes('จุดความร้อน'))
    const aqiLine = lines.find(l => l.includes('PM2.5') || l.includes('AQI'))
    const rainLine = lines.find(l => l.includes('ฝนตก') || l.includes('ฝน'))
    const criticalLine = lines.find(l => l.includes('สถานีวิกฤต'))
    const warningLine = lines.find(l => l.includes('สถานีเฝ้าระวัง'))
    const firePlaces = lines.find(l => l.includes('จุดไฟป่า'))

    const cleanLine = (line: string | undefined) => line ? line.replace(/^-\s*/, '').replace(/.*:/, '').trim() : ''

    if (q.includes('pm2.5') || q.includes('pm 2.5') || q.includes('ฝุ่น') || q.includes('อากาศ') || q.includes('aqi')) {
        if (aqiLine) return `😷 **ฝุ่น PM2.5 ภาพรวมวันนี้:**\n\n${cleanLine(aqiLine)}\n\nรักษาสุขภาพด้วยนะคะ! 🍃`
        return 'ขออภัยด้วยค่ะ ตอนนี้ดึงข้อมูล AQI ไม่ได้เลย ลองใหม่สักพักนะคะ 🙏'
    }

    if (q.includes('ฝน') || q.includes('ฝนตก') || q.includes('rain')) {
        if (rainLine) return `🌧️ **พิกัดที่ฝนตกหนักสุด 24 ชม. ที่ผ่านมา:**\n\n${cleanLine(rainLine)}\n\nระวังพกร่มก่อนออกจากบ้านด้วยน้า ☂️`
        return 'ยังไม่มีรายงานฝนตกหนักในจุดเฝ้าระวังเลยค่ะ แดดน่าจะแจ่มใส ☀️'
    }

    if (q.includes('ไฟ') || q.includes('ไฟป่า') || q.includes('fire')) {
        let result = `🔥 **อัปเดตไฟป่าภาพรวมล่าสุด:**\n\n${cleanLine(fireLine) || 'ไม่พบสัญญาณไฟ'}\n`
        if (firePlaces) result += `พิกัดไฟที่พบ: ${cleanLine(firePlaces)}\n`
        result += '\nตอนอากาศแห้งแบบนี้ ระวังฝุ่นควันด้วยนะคะ 🌲'
        return result
    }

    if (q.includes('น้ำ') || q.includes('น้ำท่วม') || q.includes('flood') || q.includes('water')) {
        let result = `💧 **สถานการณ์น้ำท่วม (แม่น้ำสายหลัก):**\n\n${cleanLine(waterLine)}\n`
        if (criticalLine) result += `🚨 แจ้งเตือน: ${cleanLine(criticalLine)}`
        if (warningLine) result += `\n⚠️ เฝ้าระวัง: ${cleanLine(warningLine)}`
        return result + '\n\nใครอยู่พื้นที่เสี่ยงระลึกไว้และเก็บของขึ้นที่สูงนะคะ 💙'
    }

    if (q.includes('สวัสดี') || q.includes('ดีครับ') || q.includes('ทำอะไร')) {
        return `สวัสดีค่ะ! 👋 เราคือ **Disaster AI Assistant** หุ่นยนต์เฝ้าระวังภัยพิบัติแห่งประเทศไทย 🇹🇭\n\nอยากรู้เรื่อง ฝน, น้ำท่วม, ไฟป่า หรือ ฝุ่นควัน ที่จังหวัดไหนในประเทศ พิมพ์ถามฉันได้เลยค่ะ! เช่น "เชียงใหม่ฝนตกไหม" 😊`
    }

    if (q.includes('สรุป') || q.includes('ภาพรวม') || q.includes('ตอนนี้') || q.length < 15) {
        let result = 'นี่คือสรุปภาพรวมล่าสุดค่ะ 🌍✨\n\n'
        if (waterLine) result += `💧 **เรื่องน้ำ:** ${cleanLine(waterLine)}\n`
        if (fireLine) result += `🔥 **เรื่องไฟ:** ${cleanLine(fireLine)}\n`
        if (aqiLine) result += `💨 **เรื่องอากาศ:** ${cleanLine(aqiLine)}\n`
        if (rainLine) result += `🌧️ **เรื่องฝน:** ${cleanLine(rainLine)}\n`

        if (!waterLine && !fireLine) result += 'ตอนนี้ข้อมูลกำลังอัปเดตนะคะ อาจจะต้องรอแปปนึง ⏳\n'

        return result + '\nเจาะจงจังหวัดไหนพิเศษไหมคะ พิมพ์บอกมาได้เลย 💬'
    }

    return `รับทราบค่ะ 🌟 แต่เพื่อให้ AI ช่วยหาคำตอบได้แม่นยำขึ้น รบกวนพิมพ์ระบุพิกัดชัดๆ หน่อยนะคะ เช่น:\n\n- "PM2.5 ที่ขอนแก่นตอนนี้"\n- "ร้อยเอ็ดฝนตกไหม"\n- "สถานการณ์น้ำลพบุรี"\n\nหรือถ้าอยากดูทุกอย่างรวมกัน พิมพ์ "สรุปภาพรวม" ได้เลยค่ะ 💙`
}
