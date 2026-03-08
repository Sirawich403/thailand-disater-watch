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
3. **ห้ามแต่งข้อมูลเอง เดา หรือใช้ฐานข้อมูลเก่าของคุณเด็ดขาด:** หากผู้ใช้ถามถึงพื้นที่ใดๆ แล้วในข้อมูล Context ไม่มีรายงานจุดเสี่ยงหรือสถานีในพื้นที่นั้นเลย ให้ตอบไปตามตรงว่า "ณ ปัจจุบันยังไม่มีรายงานภัยพิบัติในพิกัดดังกล่าวค่ะ จึงถือว่ายังอยู่ในเกณฑ์ปลอดภัยนะคะ 🌟"
4. ตอบคำถามชีวิตประจำวันได้ เช่น "รังสิตฝนตกไหม", "เชียงใหม่น้ำจะท่วมไหม" โดยวิเคราะห์จาก Context ที่เจอ
5. ตอบอย่างเป็นธรรมชาติ เป็นมิตร ไม่โยนข้อมูลเป็นลิสต์ยาวๆ น่าเบื่อจนเกินไป (ใช้คำลงท้าย ครับ/ค่ะ สลับกันไป หรือใช้อีโมจิ 🌟🌧️🔥)
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

    if (isSystem) {
        return `🤖 **เกี่ยวกับ Thailand Disaster Watch**\nระบบนี้แสดงข้อมูลภัยพิบัติ Real-time (น้ำ, ฝน, ไฟป่า, ฝุ่น) จาก สสน., NASA, WAQI ค่ะ\nพิมพ์ถามพิกัดที่อยากรู้ได้เลย เช่น "เชียงใหม่ฝนตกไหม" 💙`
    }

    if (q.includes('สวัสดี') || q.includes('ดีครับ') || q.includes('ทำอะไร')) {
        return `สวัสดีค่ะ! 👋 เราคือ **Disaster AI Assistant** หุ่นยนต์เฝ้าระวังภัยพิบัติ 🇹🇭\nอยากเช็ค ฝน, น้ำ, ไฟ, ฝุ่น ที่ไหน พิมพ์บอกพิกัดมาได้เลย!`
    }

    const cleanLine = (l: string | undefined) => l ? l.replace(/^\[.*?\]\s*/, '').trim() : ''

    // 1. Check if we have dynamic RAG Context (matches specific amphoes/tambons/stations/provinces)
    const specLines = specificContext ? specificContext.split('\n').filter(l => l.startsWith('[')) : []

    if (specLines.length > 0) {
        const rainLines = specLines.filter(l => l.startsWith('[ฝนตก]'))
        const aqiLines = specLines.filter(l => l.startsWith('[PM2.5]'))
        const fireLines = specLines.filter(l => l.startsWith('[ไฟป่า]'))
        const waterLines = specLines.filter(l => l.startsWith('[ระดับน้ำ]'))

        let response = `📍 **ข้อมูลในพื้นที่นี้:**\n`
        let answered = false

        if (isSafety && !isRain && !isAqi && !isFire && !isWater) {
            let msg = `🛡️ **ประเมินความปลอดภัยในพื้นที่รอบๆ:**\n`
            if (rainLines.length > 0) msg += `- 🌧️ ฝนตก: ${cleanLine(rainLines[0])}\n`
            if (aqiLines.length > 0) msg += `- 😷 อากาศ: ${cleanLine(aqiLines[0])}\n`
            if (fireLines.length > 0) msg += `- 🔥 ไฟป่า: พบจุดความร้อน ${fireLines.length} จุด\n`
            if (waterLines.length > 0) msg += `- 💧 ระดับน้ำ: ${cleanLine(waterLines[0])}\n`

            if (rainLines.length === 0 && aqiLines.length === 0 && fireLines.length === 0 && waterLines.length === 0) {
                return `รอดปลอดภัย 100% ค่ะ! 🎉 ไม่มีรายงานจุดเสี่ยงหรือเตือนภัยในพื้นที่นี้เลย อยู่บ้านสบายใจได้นะคะ 🏡✨`
            }
            return msg + `\nภาพรวมหากไม่ได้อยู่ในจุดเสี่ยงเป๊ะๆ น่าจะปลอดภัยค่ะ ดูแลตัวเองด้วยนะคะ 💙`
        }

        if (isRain) {
            if (rainLines.length > 0) {
                response += `🌧️ **พิกัดที่พบฝนตก:**\n` + rainLines.slice(0, 5).map(l => `- ${cleanLine(l)}`).join('\n') + '\n'
            } else {
                response += `🌤️ **ฝนตก:** ตอนนี้ไม่มีรายงานฝนตกหนักจากสถานีใกล้เคียงค่ะ\n`
            }
            answered = true
        }

        if (isAqi) {
            if (aqiLines.length > 0) {
                response += `😷 **ฝุ่น PM2.5:**\n` + aqiLines.slice(0, 5).map(l => `- ${cleanLine(l)}`).join('\n') + '\n'
            } else {
                response += `🍃 **ฝุ่น PM2.5:** ค่าฝุ่นยังไม่วิกฤตจนระบบจับได้ค่ะ\n`
            }
            answered = true
        }

        if (isFire) {
            if (fireLines.length > 0) {
                response += `🔥 **พบไฟป่า/จุดความร้อน:**\n` + fireLines.slice(0, 5).map(l => `- ${cleanLine(l)}`).join('\n') + '\n'
            } else {
                response += `🌲 **ไฟป่า:** ปลอดภัยค่ะ ตอนนี้ไม่พบจุดความร้อนระแวกนี้\n`
            }
            answered = true
        }

        if (isWater) {
            if (waterLines.length > 0) {
                response += `💧 **ระดับน้ำ:**\n` + waterLines.slice(0, 5).map(l => `- ${cleanLine(l)}`).join('\n') + '\n'
            } else {
                response += `🌊 **ระดับน้ำ:** สถานการณ์ปกติ ทรงตัวดีค่ะ\n`
            }
            answered = true
        }

        if (answered) return response.trim()

        // If no specific intent was asked, just show top general details found
        return `📍 **ข้อมูลพื้นที่จากที่ค้นหา:**\n` + specLines.slice(0, 5).map(l => `- ${cleanLine(l)}`).join('\n')
    }

    // 2. If NO SPECIFIC MATCHES (e.g. didn't mention a valid province/station or spelled it differently)
    const isSpecificQuery = q.length > 3 && !q.includes('ประเทศ') && !q.includes('ภาพรวม') && !q.includes('สรุป')

    if (isSpecificQuery && (isRain || isAqi || isFire || isWater || isSafety)) {
        return `🔍 ตอนนี้ยังไม่พบข้อมูลสถานีแจ้งเตือนในพิกัดที่คุณถามค่ะ (อาจเป็นพื้นที่ปลอดภัยไม่มีสถานการณ์ฉุกเฉิน 🌟)\n\nหากต้องการดูข้อมูลภาพรวมทั่วประเทศ พิมพ์ "สรุปภาพรวม" ได้เลยค่ะ`
    }

    // 3. Nationwide / General Fallback
    const lines = context ? context.split('\n').filter(l => l.trim()) : []
    const waterLine = lines.find(l => l.includes('สถานการณ์น้ำ') || l.includes('สถานี'))
    const fireLine = lines.find(l => l.includes('ไฟป่า') || l.includes('จุดความร้อน'))
    const aqiLine = lines.find(l => l.includes('PM2.5') || l.includes('AQI'))
    const rainLine = lines.find(l => l.includes('ฝนตก') || l.includes('ฝน'))

    const cleanCtxLine = (line: string | undefined) => line ? line.replace(/^-\s*/, '').replace(/.*:/, '').trim() : ''

    if (q.includes('สรุป') || q.includes('ภาพรวม') || q.includes('ตอนนี้') || q.includes('ไงบ้าง') || q.includes('เป็นไง') || q.length < 15) {
        let result = '🌍 **สรุปภาพรวมทั่วประเทศล่าสุด:**\n'
        if (waterLine) result += `💧 ${cleanCtxLine(waterLine)}\n`
        if (fireLine) result += `🔥 ${cleanCtxLine(fireLine)}\n`
        if (aqiLine) result += `💨 ${cleanCtxLine(aqiLine)}\n`
        if (rainLine) result += `🌧️ ${cleanCtxLine(rainLine)}\n`

        if (!waterLine && !fireLine) result += 'กำลังซิงค์ข้อมูลล่าสุดให้ รอแปปนึงนะคะ ⏳\n'
        return result + '\nพิมพ์ถามระบุพิกัดชัดๆ ได้เลยค่ะ เช่น "เชียงใหม่ฝนตกไหม" 💬'
    }

    return `รับทราบค่ะ 🌟 เพื่อความแม่นยำขึ้น รบกวนพิมพ์พิกัดให้ชัดอีกนิดนะคะ เช่น:\n- "PM2.5 กรุงเทพ"\n- "เชียงใหม่ ฝนตกไหม"\nหรือพิมพ์ "สรุปภาพรวม" เพื่อดูสถานการณ์ทั่วประเทศค่ะ 💙`
}
