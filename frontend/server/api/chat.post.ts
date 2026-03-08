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
            return { response: await generateLocalResponse(userMessage, dashboardContext, '') }
        }
        return { response: 'ระบบ AI ยังไม่ได้ตั้งค่า กรุณาแจ้งผู้ดูแลระบบครับ' }
    }

    // Build prompt
    const systemInstruction = `คุณคือ "Disaster AI Assistant" ผู้ช่วยอัจฉริยะสุดใจดีสำหรับเว็บไซต์ Thailand Disaster Watch
หน้าที่และกฎข้อบังคับของคุณ:
1. ตอบคำถามเกี่ยวกับภัยพิบัติ (น้ำท่วม, ไฟป่า, ฝุ่น PM2.5, ฝนตก) ครอบคลุมทุกตำบล อำเภอ และจังหวัดทั่วประเทศไทย
2. **สำคัญมากที่สุด:** คุณต้องอ้างอิงการตอบคำถามจาก [ข้อมูลภาพรวม] และ [ข้อมูลสืบค้นเฉพาะเจาะจง] ที่ระบบส่งให้แนบท้ายมาเท่านั้น (เป็นข้อมูล Real-time อัปเดตทุก 5 นาทีจากเซิร์ฟเวอร์หลัก)
3. **ห้ามแต่งข้อมูลเอง เดา หรือใช้ฐานข้อมูลเก่าของคุณเด็ดขาด:** หากผู้ใช้ถามถึงพื้นที่ใดๆ แล้วในข้อมูล Context ไม่มีรายงานจุดเสี่ยงหรือสถานีในพื้นที่นั้นเลย ให้ตอบเป็นความเรียงว่า "ตอนนี้ที่ [พิกัด] สภาพอากาศปกติครับ ไม่มีรายงานพายุฝน น้ำท่วม หรือฝุ่นควันรุนแรงแต่อย่างใด สบายใจได้เลยครับ ให้ผมช่วยดูข้อมูลจังหวัดอื่นเพิ่มเติมไหมครับ?"
4. ตอบคำถามชีวิตประจำวันได้ เช่น "รังสิตฝนตกไหม", "เชียงใหม่น้ำจะท่วมไหม" โดยวิเคราะห์จาก Context ที่เจอ
5. **รูปแบบการตอบ (Formatting):** ให้บรรยายตอบเป็น "ย่อหน้าความเรียงที่อ่านธรรมชาติ คล้ายคนพูด" (Conversational Paragraph) แบบเดียวกับ Google Assistant **ห้ามใช้ Bullet points (-) หรือทำเป็นก้อนลิสต์รายงานข้อมูลดิบเด็ดขาด** (ใช้คำลงท้าย ครับ/ค่ะ สลับกันไป หรือใช้อีโมจิประกอบพอดีๆ ☀️🌦️)
6. หากผู้ใช้ถามว่าข้อมูลมาจากไหน ให้อธิบายว่ามาจาก สสน. (ThaiWater), NASA FIRMS, และ WAQI`

    let historyText = ''
    if (history?.length > 0) {
        const recent = history.slice(-4)
        historyText = '[ประวัติการสนทนา]\n' + recent.map((m: any) => `${m.role === 'user' ? 'User' : 'AI'}: ${m.content}`).join('\n') + '\n\n'
    }

    // --- DYNAMIC RAG CONTEXT (Fetch specific data based on query) ---
    let specificContext = ''
    try {
        const q = userMessage.toLowerCase()
        const [summary, fireData, aqiData, rainData] = await Promise.allSettled([
            $fetch('/api/dashboard/summary'),
            $fetch('/api/dashboard/fires'),
            $fetch('/api/dashboard/aqi'),
            $fetch('/api/dashboard/rain'),
        ])

        let matches: string[] = []

        // Helper to check if a location keyword is in the query (avoiding generic short words)
        const inQ = (kw: string | undefined | null) => {
            if (!kw) return false
            const word = kw.replace(/^(จ\.|อ\.|ต\.|บ้าน|เมือง)/, '').trim()
            if (word.length <= 2) return false // Skip very short words to avoid false positives
            if (['ประเทศไทย', 'กรุงเทพ', 'เหนือ', 'ใต้', 'ออก', 'ตก'].includes(word)) return false // Skip too broad if we want specific
            return q.includes(word.toLowerCase())
        }

        // Exact province match check (for broader scope)
        const isProvinceMatch = (prov: string | undefined) => prov && q.includes(prov.replace('มหานคร', '').trim())

        if (rainData.status === 'fulfilled') {
            const data = (rainData.value as any)?.rainStations || []
            data.forEach((r: any) => {
                if (inQ(r.amphoe) || inQ(r.tambon) || inQ(r.stationName) || isProvinceMatch(r.province)) {
                    matches.push(`[ฝนตก] จ.${r.province} อ.${r.amphoe}: ${r.rain24h}mm`)
                }
            })
        }

        if (aqiData.status === 'fulfilled') {
            const data = (aqiData.value as any)?.stations || []
            data.forEach((s: any) => {
                if (inQ(s.name) || inQ(s.nameEn) || isProvinceMatch(s.name)) {
                    matches.push(`[PM2.5] สถานี ${s.name}: AQI=${s.aqi}`)
                }
            })
        }

        if (fireData.status === 'fulfilled') {
            const data = (fireData.value as any)?.fires || []
            let provCount: Record<string, number> = {}
            data.forEach((f: any) => {
                if (isProvinceMatch(f.province)) {
                    provCount[f.province] = (provCount[f.province] || 0) + 1
                } else if (inQ(f.name)) {
                    matches.push(`[ไฟป่า] พบที่ ${f.name} จ.${f.province || '?'} (ระดับ ${f.intensity})`)
                }
            })
            for (const [p, count] of Object.entries(provCount)) {
                matches.push(`[ไฟป่า] จ.${p} พบจุดความร้อน ${count} จุด`)
            }
        }

        if (summary.status === 'fulfilled') {
            const data = (summary.value as any)?.stations || []
            data.forEach((s: any) => {
                if (inQ(s.name) || inQ(s.description) || isProvinceMatch(s.description)) {
                    matches.push(`[ระดับน้ำ] สถานี ${s.name}: ${s.currentLevel}m (${s.riskLevel === 'danger' ? 'วิกฤต' : s.riskLevel === 'warning' ? 'เฝ้าระวัง' : 'ปกติ'})`)
                }
            })
        }

        if (matches.length > 0) {
            // Remove duplicates and limit to 100 lines to provide extensive data for large provinces
            const uniqueMatches = [...new Set(matches)].slice(0, 100)
            specificContext = `\n[ข้อมูลสืบค้นเฉพาะเจาะจงพื้นที่จากฐานข้อมูล Real-time ล่าสุด]\n${uniqueMatches.join('\n')}\n`
            console.log(`[Chat] Added ${uniqueMatches.length} specific local context lines for query: "${userMessage}"`)
        }

    } catch (e) {
        console.error('[Chat] Failed to build dynamic RAG context', e)
    }

    const fullPrompt = `${systemInstruction}\n\n[ข้อมูลภาพรวมระดับประเทศ]\n${dashboardContext}\n${specificContext}\n${historyText}คำถามล่าสุดจากผู้ใช้: ${userMessage}`

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
                return { response: await generateLocalResponse(userMessage, dashboardContext, specificContext) }
            }

            if (!res.ok) {
                const errText = await res.text().catch(() => '')
                console.error(`[Chat] Gemini error ${res.status}:`, errText.substring(0, 200))
                return { response: await generateLocalResponse(userMessage, dashboardContext, specificContext) }
            }

            const data = await res.json()
            const answer = data?.candidates?.[0]?.content?.parts?.[0]?.text

            if (answer) {
                console.log('[Chat] Gemini answered, length:', answer.length)
                return { response: answer }
            }

            // Empty answer — fallback
            return { response: await generateLocalResponse(userMessage, dashboardContext, specificContext) }

        } catch (error: any) {
            if (error.name === 'AbortError') {
                console.error('[Chat] Timeout on attempt', attempt + 1)
            } else {
                console.error('[Chat] Error on attempt', attempt + 1, ':', error.message)
            }
            if (attempt === maxRetries - 1) {
                return { response: await generateLocalResponse(userMessage, dashboardContext, specificContext) }
            }
        }
    }

    return { response: await generateLocalResponse(userMessage, dashboardContext, specificContext) }
})

/**
 * Generate a response locally from dashboard data — no AI needed.
 * This is the fallback when Gemini is unavailable (rate limited, timeout, etc.)
 */
async function generateLocalResponse(question: string, context: string, specificContext: string = ''): Promise<string> {
    const q = question.toLowerCase()

    // Define Intents
    let isRain = q.includes('ฝน') || q.includes('rain') || q.includes('ตกไหม') || q.includes('พายุ')
    let isAqi = q.includes('pm2.5') || q.includes('pm 2.5') || q.includes('ฝุ่น') || q.includes('อากาศ') || q.includes('aqi') || q.includes('ควัน')
    let isFire = q.includes('ไฟ') || q.includes('fire') || q.includes('ลาม') || q.includes('ไหม้') || q.includes('จุดความร้อน')
    let isWater = q.includes('น้ำท่วม') || q.includes('น้ำ') || q.includes('ระดับน้ำ') || q.includes('flood') || q.includes('ท่วมไหม')
    let isSafety = q.includes('รอด') || q.includes('ปลอดภัย') || q.includes('อันตราย') || q.includes('อยู่บ้าน') || q.includes('เป็นไงบ้าง') || q.includes('เตรียมตัว')
    let isSystem = q.includes('ระบบนี้') || q.includes('คืออะไร') || q.includes('ใช้งานยังไง') || q.includes('แหล่งข้อมูล') || q.includes('มาจากไหน') || q.includes('ใครทำ')
    let isWhere = q.includes('ที่ไหน') || q.includes('จังหวัดไหน') || q.includes('ตรงไหน') || q.includes('บริเวณไหน')

    if (isSystem) {
        return `🤖 **เกี่ยวกับระบบ Thailand Disaster Watch**\nระบบนี้รวบรวมข้อมูลภัยพิบัติแบบ Real-time โดยดึงข้อมูลระดับน้ำและฝนจาก สสน. (ThaiWater), จุดความร้อนไฟป่าจากดาวเทียม NASA FIRMS และฝุ่นจาก WAQI ครับ พิมพ์ถามสภาพอากาศของแต่ละจังหวัดได้เลยนะครับ เช่น "เชียงใหม่ฝนตกไหม"`
    }

    if (q.includes('สวัสดี') || q.includes('ดีครับ') || q.includes('ทำอะไร')) {
        return `สวัสดีครับ! 👋 ผมคือ **Disaster AI Assistant** คอยช่วยเหลือติดตามสถานการณ์ภัยพิบัติในประเทศไทยครับ วันนี้อยากให้ผมช่วยเช็คข้อมูลฝนตก น้ำท่วม ไฟป่า หรือฝุ่น PM2.5 ที่ไหน พิมพ์บอกพิกัดมาได้เลยครับ!`
    }

    const cleanLine = (l: string | undefined) => l ? l.replace(/^\[.*?\]\s*/, '').trim() : ''

    // 1. Check if we have dynamic RAG Context (matches specific amphoes/tambons/stations/provinces)
    const specLines = specificContext ? specificContext.split('\n').filter(l => l.startsWith('[')) : []

    if (specLines.length > 0) {
        const rainLines = specLines.filter(l => l.startsWith('[ฝนตก]'))
        const aqiLines = specLines.filter(l => l.startsWith('[PM2.5]'))
        const fireLines = specLines.filter(l => l.startsWith('[ไฟป่า]'))
        const waterLines = specLines.filter(l => l.startsWith('[ระดับน้ำ]'))

        let paragraph = ''
        let answered = false

        if (isSafety && !isRain && !isAqi && !isFire && !isWater) {
            let issues = []
            if (rainLines.length > 0) issues.push(`กลุ่มฝน (${cleanLine(rainLines[0])})`)
            if (aqiLines.length > 0) issues.push(`ปัญหาฝุ่นควัน (${cleanLine(aqiLines[0])})`)
            if (fireLines.length > 0) issues.push(`จุดความร้อนไฟป่า ${fireLines.length} จุด`)
            if (waterLines.length > 0) issues.push(`ระดับน้ำล้นตลิ่ง (${cleanLine(waterLines[0])})`)

            if (issues.length === 0) {
                return `สำหรับพื้นที่ที่คุณสอบถาม ตอนนี้สภาพอากาศและสถานการณ์ปกติดีทุกอย่างเลยครับ ท้องฟ้าแจ่มใส ไม่มีรายงานพายุ ฝุ่น หรือภัยน้ำให้กังวล สบายใจได้ครับ 😊`
            } else {
                return `จากการตรวจเช็ค ตอนนี้ทางระบบพบว่ามีสิ่งที่อาจจะต้องเฝ้าระวังคือ ${issues.join(' และ ')} ครับ ถ้าบ้านไม่ได้อยู่ในจุดแจ้งเตือนพอดีก็ถือว่าปลอดภัยครับ แต่เตรียมตัวป้องกันไว้ก่อนก็ดีนะครับ 💙`
            }
        }

        if (isRain) {
            if (rainLines.length > 0) {
                const places = rainLines.slice(0, 3).map(l => cleanLine(l)).join(', ')
                paragraph += `ตรวจพบกลุ่มฝนในพื้นที่ครับ โดยจุดที่มีฝนคือ ${places} `
            } else {
                paragraph += `ตอนนี้ฝนไม่ได้ตกครับ สภาพอากาศปัจจุบันไม่มีรายงานพายุฝนจากสถานีใกล้เคียงครับ `
            }
            answered = true
        }

        if (isAqi) {
            if (aqiLines.length > 0) {
                const places = aqiLines.slice(0, 2).map(l => cleanLine(l)).join(' และ ')
                paragraph += `สรุปค่าฝุ่นตอนนี้พบรายงานจาก ${places} หากค่า AQI เกิน 100 แนะนำสวมหน้ากากอนามัยด้วยนะครับ `
            } else {
                paragraph += `คุณภาพอากาศและค่าฝุ่น PM2.5 ตอนนี้ถือว่าอยู่ในเกณฑ์ดีครับ ไม่มีรายงานฝุ่นเกินมาตรฐาน `
            }
            answered = true
        }

        if (isFire) {
            if (fireLines.length > 0) {
                const places = fireLines.slice(0, 3).map(l => cleanLine(l)).join(', ')
                paragraph += `พบพิกัดจุดความร้อนไฟป่าใกล้เคียงครับ (${places}) ระมัดระวังควันไฟกันด้วยนะครับ `
            } else {
                paragraph += `ตรวจสอบแล้วไม่พบจุดไฟป่าในพื้นที่นี้ครับ ปลอดภัยจากกลุ่มควันไฟและมลพิษแน่นอนครับ `
            }
            answered = true
        }

        if (isWater) {
            if (waterLines.length > 0) {
                const places = waterLines.slice(0, 2).map(l => cleanLine(l)).join(' และ ')
                paragraph += `มีรายงานความเสี่ยงระดับน้ำที่ ${places} ครับ แนะนำติดตามประกาศน้ำล้นตลิ่งนะครับ `
            } else {
                paragraph += `ระดับในพื้นฐานน้ำยังคงเป็นปกติครับ ไม่มีแจ้งเตือนน้ำล้นตลิ่งเลย สบายใจได้ครับ `
            }
            answered = true
        }

        if (answered) return paragraph.trim()

        const summaryPlaces = specLines.slice(0, 3).map(l => cleanLine(l)).join(', ')
        return `ในพื้นที่ที่คุณอยากรู้ พบข้อมูลจากสถานี ${summaryPlaces} ครับ หากมีเรื่องไหนเจาะจงเช่น "ฝนตกไหม" ถามผมต่อได้เลยนะครับ 😊`
    }

    // 2. If NO SPECIFIC MATCHES (e.g. didn't mention a valid province/station or spelled it differently)
    const isSpecificQuery = q.length > 3 && !q.includes('ประเทศ') && !q.includes('ภาพรวม') && !q.includes('สรุป') && !isWhere

    if (isSpecificQuery && (isRain || isAqi || isFire || isWater || isSafety)) {
        return `ตอนนี้ยังไม่พบข้อมูลสถานีแจ้งเตือนในพิกัดที่คุณถามมาเลยครับ (ซึ่งน่าจะเป็นพื้นที่ปลอดภัยไม่มีสถานการณ์ฉุกเฉินครับ 🌟) หากต้องการดูภาพรวมทั่วประเทศ พิมพ์บอกว่า "สรุปภาพรวม" ได้เลยนะครับ`
    }

    // 3. Nationwide / General Fallback
    const lines = context ? context.split('\n').filter(l => l.trim()) : []
    const waterLine = lines.find(l => l.includes('สถานการณ์น้ำ') || l.includes('สถานี'))
    const fireLine = lines.find(l => l.includes('ไฟป่า') || l.includes('จุดความร้อน'))
    const aqiLine = lines.find(l => l.includes('PM2.5') || l.includes('AQI'))
    const rainLine = lines.find(l => l.includes('ฝนตก') || l.includes('ฝน'))

    const cleanCtxLine = (line: string | undefined) => line ? line.replace(/^-\s*/, '').replace(/.*:/, '').trim() : ''

    if (q.includes('สรุป') || q.includes('ภาพรวม') || q.includes('ตอนนี้') || q.includes('ไงบ้าง') || q.includes('เป็นไง') || isWhere || q.length < 15) {
        let result = ''
        if (isWhere) {
            result = 'ตอนนี้ในประเทศไทยพบสถานการณ์หลักๆ ดังนี้ครับ 🌍 '
        } else {
            result = 'นี่คือสรุปสถานการณ์ภาพรวมของประเทศล่าสุดนะครับ 🌍 '
        }
        if (waterLine) result += `สถานการณ์น้ำปัจจุบัน ${cleanCtxLine(waterLine)} `
        if (fireLine) result += `เรื่องไฟป่า ${cleanCtxLine(fireLine)} `
        if (aqiLine) result += `ด้านสภาพอากาศ ${cleanCtxLine(aqiLine)} `
        if (rainLine) result += `และ ${cleanCtxLine(rainLine)} `

        if (!waterLine && !fireLine) result += 'ระบบกำลังเตรียมข้อมูลล่าสุดสักครู่นะครับ ⏳ '
        return result.trim() + ' พิมพ์ถามชื่อพิกัดหรือจังหวัดเจาะจงได้เลยนะครับ เช่น "เชียงใหม่ฝนตกไหม" เป็นต้น 💬'
    }

    return `รบกวนช่วยพิมพ์พิกัดให้ชัดอีกนิดนะครับ เพื่อความแม่นยำในการค้นหา เช่น "PM2.5 เชียงใหม่" หรือ "รังสิต ฝนตกไหม" หรือพิมพ์ถาม "สรุปภาพรวม" เพื่อดูสถานการณ์ทั่วประเทศได้เลยครับ 💙`
}
