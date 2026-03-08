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
หน้าที่ของคุณ:
1. ให้ข้อมูลและคำแนะนำเกี่ยวกับสถานการณ์น้ำท่วม ไฟป่า ฝุ่น PM2.5 และฝนตกในประเทศไทย
2. ตอบคำถามเกี่ยวกับการใช้ชีวิตประจำวันหรือความปลอดภัยได้ เช่น "ฝนจะตกไหม", "รอดไหม", "น้ำจะท่วมไหม" โดยวิเคราะห์แจกแจงจากข้อมูลที่มี
3. ตอบคำถามอย่างเป็นธรรมชาติ เหมือนคนคุยกัน (Conversational AI) ไม่เอาแบบหุ่นยนต์ หรือก็อปปี้ลิสต์ข้อมูลมาแปะทื่อๆ
4. ใช้ข้อมูลจาก [ข้อมูลภัยพิบัติปัจจุบัน] ที่ระบบส่งให้เสมอ สรุปใจความสำคัญให้เข้าใจง่าย และอธิบายแหล่งที่มาได้ถอนถาม (เช่น NASA, ThaiWater, WAQI)
5. ใช้ภาษาไทยที่สุภาพ เป็นมิตร กระตือรือร้น (ใช้คำลงท้าย ครับ/ค่ะ สลับกันไปตามเหมาะสม หรือใช้อีโมจิช่วยสื่ออารมณ์ 🌟🌧️🔥)
6. หากผู้ใช้ถามเรื่องทั่วไปที่นอกเหนือจากภัยพิบัติ สามารถคุยเล่นได้นิดหน่อยแล้วค่อยวกกลับมาเรื่องภัยพิบัติอย่างสุภาพ`

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
            // Remove duplicates and limit to 40 lines
            const uniqueMatches = [...new Set(matches)].slice(0, 40)
            specificContext = `\n[ข้อมูลสืบค้นเฉพาะเจาะจงพื้นที่จากฐานข้อมูล (Local Search Results)]\n${uniqueMatches.join('\n')}\n`
            console.log(`[Chat] Added ${uniqueMatches.length} specific local context lines for query: "${userMessage}"`)
        }

    } catch (e) {
        console.error('[Chat] Failed to build dynamic RAG context', e)
    }

    const fullPrompt = `${systemInstruction}\n\n${dashboardContext}\n${specificContext}\n${historyText}คำถามล่าสุดจากผู้ใช้: ${userMessage}`

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

    // 0. Use Specific Context if available (Highly targeted local matches)
    if (specificContext && specificContext.trim() !== '') {
        const lines = specificContext.split('\n').filter(l => l.startsWith('['))
        if (lines.length > 0) {
            let msg = `ตรวจพบพื้นที่ใกล้เคียงจากคีย์เวิร์ดที่คุณถามค่ะ 🔍\n\n`
            lines.slice(0, 10).forEach(l => {
                msg += `- ${l.replace(/^\[.*?\]\s*/, '')}\n`
            })
            msg += `\nดูแลตัวเองด้วยนะคะ มีอะไรถามเพิ่มได้เลย 🌟`
            return msg
        }
    }

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

        let isRain = q.includes('ฝน') || q.includes('rain') || q.includes('ตกไหม') || q.includes('พายุ')
        let isAqi = q.includes('pm2.5') || q.includes('pm 2.5') || q.includes('ฝุ่น') || q.includes('อากาศ') || q.includes('aqi') || q.includes('ควัน')
        let isFire = q.includes('ไฟ') || q.includes('fire') || q.includes('ลาม') || q.includes('ไหม้') || q.includes('จุดความร้อน')
        let isWater = q.includes('น้ำท่วม') || q.includes('น้ำ') || q.includes('ระดับน้ำ') || q.includes('flood') || q.includes('ท่วมไหม')

        let isSafetyQuestion = q.includes('รอด') || q.includes('ปลอดภัย') || q.includes('อันตราย') || q.includes('อยู่บ้าน') || q.includes('เป็นไงบ้าง')

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
                    const sortedRain = [...provRain].sort((a, b) => (b.rain24h || 0) - (a.rain24h || 0)).slice(0, 3)
                    const maxRain = sortedRain[0].rain24h || 0
                    const placesList = sortedRain.map(r => `${r.amphoe} (${r.rain24h}mm)`).join(', ')

                    let msg = `ที่ **${matchedProvince}** ตอนนี้มีฝนตกค่ะ 🌧️\n\nจุดที่ฝนตกหนักสุด 24 ชม. ที่ผ่านมาคือ:\n- **${placesList}**\n\nปริมาณสูงสุดอยู่ที่ ${maxRain} mm`
                    msg += maxRain > 35 ? ' ถือว่าตกหนักพอสมควรเลย ระวังน้ำขังด้วยนะคะ ☂️' : ' ไม่ค่อยหนักเท่าไหร่ค่ะ 🌤️'
                    return msg
                } else {
                    return `ตอนนี้ที่ **${matchedProvince}** ยังไม่มีรายงานฝนตกจากสถานีตรวจวัดเลยค่ะ ท้องฟ้าน่าจะโปร่งใส ☀️`
                }
            }

            if (isAqi) {
                const data = aqiData.status === 'fulfilled' ? (aqiData.value as any)?.stations || [] : []
                const provAqi = data.filter((r: any) => r.name?.includes(matchedProvince) || r.nameEn?.toLowerCase().includes(matchedProvince.toLowerCase()))
                if (provAqi.length > 0) {
                    const sortedAqi = [...provAqi].sort((a, b) => (b.aqi || 0) - (a.aqi || 0)).slice(0, 3)
                    const maxAqi = sortedAqi[0].aqi || 0
                    const placesList = sortedAqi.map(r => `${r.name} (AQI: ${r.aqi})`).join(', ')

                    let msg = `ค่าฝุ่นที่ **${matchedProvince}** จุดที่วัดได้สูงสุดอยู่ที่ AQI **${maxAqi}** ค่ะ 💨\n\nพิกัดสถานี:\n- ${placesList}\n\n`
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
                    const sortedFires = [...provFire].sort((a, b) => (b.areaSqKm || 0) - (a.areaSqKm || 0)).slice(0, 3)
                    const placesList = sortedFires.map(f => `${f.name || f.province} (${f.intensity === 'extreme' ? 'รุนแรงมาก' : f.intensity === 'high' ? 'รุนแรง' : 'ปานกลาง'})`).join(', ')
                    return `อัปเดตไฟป่าที่ **${matchedProvince}** 🔥\n\nพบจุดความร้อนทั้งหมด **${provFire.length} จุด** จุดที่น่าเป็นห่วงคือ:\n- ${placesList}\n\nระวังฝุ่นควันและผลกระทบด้วยนะคะ 🌲`
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

            // If it's a general safety question but no specific disaster was mentioned
            if (isSafetyQuestion && !isRain && !isAqi && !isFire && !isWater) {
                let msg = `ตรวจเช็คความปลอดภัยที่ **${matchedProvince}** ให้แล้วค่ะ 🛡️\n\n`
                let issues = []

                // Quick check across all fetched data for exactly this province
                const sData = summary.status === 'fulfilled' ? (summary.value as any)?.stations || [] : []
                const fData = fireData.status === 'fulfilled' ? (fireData.value as any)?.fires || [] : []
                const aData = aqiData.status === 'fulfilled' ? (aqiData.value as any)?.stations || [] : []
                const rData = rainData.status === 'fulfilled' ? (rainData.value as any)?.rainStations || [] : []

                const pWater = sData.filter((s: any) => s.name?.includes(matchedProvince) && (s.riskLevel === 'danger' || s.riskLevel === 'critical' || s.riskLevel === 'warning'))
                const pFire = fData.filter((f: any) => f.province?.includes(matchedProvince) && (f.intensity === 'high' || f.intensity === 'extreme'))
                const pAqi = aData.filter((a: any) => a.name?.includes(matchedProvince) && a.aqi > 100)
                const pRain = rData.filter((r: any) => r.province?.includes(matchedProvince) && r.rain24h > 35)

                if (pWater.length > 0) issues.push(`🌊 มีจุดเสี่ยงน้ำท่วม ${pWater.length} แห่ง รบกวนระวังเรื่องน้ำล้นตลิ่ง`)
                if (pFire.length > 0) issues.push(`🔥 มีไฟป่าค่อนข้างรุนแรง ${pFire.length} จุด ระวังเรื่องลุกลามและควัน`)
                if (pAqi.length > 0) issues.push(`😷 ค่าฝุ่น PM2.5 เกินมาตรฐาน (${pAqi[0].aqi})`)
                if (pRain.length > 0) issues.push(`🌧️ มีรายงานฝนตกหนัก (${pRain[0].rain24h}mm) อาจเกิดน้ำขังรอการระบาย`)

                if (issues.length > 0) {
                    msg += `ตอนนี้มีเรื่องที่ต้องเฝ้าระวังนิดนึงนะคะ:\n${issues.map(i => '- ' + i).join('\n')}\n\nโดยรวมแล้วถ้าไม่ได้อยู่ในพื้นที่เสี่ยงเป๊ะๆ น่าจะรอดปลอดภัยสบายมากค่ะ แต่เตรียมตัวไว้ก่อนก็ดีน้า 💙`
                    return msg
                } else {
                    return `ณ ตอนนี้ **${matchedProvince}** รอดปลอดภัย 100% ค่ะ! 🎉\nไม่มีรายงานจุดวิกฤตน้ำท่วม ฝนตกหนัก ไฟป่ารุนแรง หรือฝุ่นควันหนาแน่นเลย อยู่บ้านสบายใจได้เลยค่ะ 🏡✨`
                }
            }

            // General province query (no specific intent recognized, just summarize basic)
            return `📍 สรุปพิกัด **${matchedProvince}**:\nดีกรีความปลอดภัยภาพรวมสูงค่ะ ตอนนี้ระบบไม่ได้แจ้งเตือนระดับวิกฤตที่น่ากังวลนะคะ 🌟\n\nสามารถเจาะจงถามได้เลย เช่น "น้ำจะท่วมไหม", "ฝนตกตรงไหนบ้าง", หรือ "อยู่บ้านปลอดภัยไหม" ค่ะ!`

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

    if (q.includes('สรุป') || q.includes('ภาพรวม') || q.includes('ตอนนี้') || q.includes('ไงบ้าง') || q.includes('เป็นไง') || q.length < 15) {
        let result = 'นี่คือสรุปภาพรวมล่าสุดค่ะ 🌍✨\n\n'
        if (waterLine) result += `💧 **เรื่องน้ำ:** ${cleanLine(waterLine)}\n`
        if (fireLine) result += `🔥 **เรื่องไฟ:** ${cleanLine(fireLine)}\n`
        if (aqiLine) result += `💨 **เรื่องอากาศ:** ${cleanLine(aqiLine)}\n`
        if (rainLine) result += `🌧️ **เรื่องฝน:** ${cleanLine(rainLine)}\n`

        if (!waterLine && !fireLine) result += 'ตอนนี้ข้อมูลกำลังอัปเดตนะคะ อาจจะต้องรอแปปนึง ⏳\n'

        return result + '\nถ้าอยากรู้ว่าบ้านตัวเองรอดรึเปล่า ลองถามโดยพิมพ์ **ชื่อจังหวัด** มาดูสิคะ 💬'
    }

    // New catch-all for system/meta questions
    if (q.includes('ระบบนี้') || q.includes('คืออะไร') || q.includes('ใช้งานยังไง') || q.includes('แหล่งข้อมูล') || q.includes('มาจากไหน') || q.includes('ใครทำ')) {
        return `🤖 **เกี่ยวกับระบบ Thailand Disaster Watch**\n\nระบบนี้ถูกสร้างขึ้นมาเพื่อเป็น Dashboard ศูนย์กลางรวมข้อมูลภัยพิบัติของประเทศไทยแบบ Real-time ค่ะ โดยติดตาม 4 เรื่องหลัก:\n1. 💧 **ระดับน้ำ/น้ำท่วม** (ข้อมูลจาก สสน. ThaiWater)\n2. 🌧️ **ปริมาณฝนสะสม** (ข้อมูลจาก สสน. ThaiWater)\n3. 🔥 **จุดความร้อน/ไฟป่า** (ข้อมูลจากดาวเทียม NASA FIRMS)\n4. 😷 **คุณภาพอากาศ PM2.5** (ข้อมูลดัชนี AQI โลก)\n\n**วิธีใช้งานแชทบอท:**\nคุณสามารถถามคำถามแบบเป็นกันเองได้เลย เช่น:\n- "เชียงใหม่ฝนตกไหม"\n- "น้ำจะท่วมบ้านรึเปล่า (พร้อมบอกจังหวัด)"\n- "สรุปสถานการณ์ระดับน้ำล่าสุดหน่อย"\n\nยินดีให้บริการเสมอค่ะ 💙`
    }

    return `รับทราบค่ะ 🌟 แต่เพื่อให้ AI ช่วยหาคำตอบได้แม่นยำขึ้น รบกวนพิมพ์ระบุพิกัดชัดๆ หน่อยนะคะ เช่น:\n\n- "PM2.5 ที่ขอนแก่นตอนนี้"\n- "ร้อยเอ็ดฝนตกไหม"\n- "สถานการณ์น้ำลพบุรี"\n\nหรือถ้าอยากดูทุกอย่างรวมกัน พิมพ์ "สรุปภาพรวม" ได้เลยค่ะ 💙`
}
