export default defineEventHandler(async (event) => {
    const body = await readBody(event)
    const userMessage = body?.message

    if (!userMessage) {
        throw createError({
            statusCode: 400,
            statusMessage: 'Message is required',
        })
    }

    // TODO: In a real app, integrate with OpenAI/Gemini API here
    // For the competition, we will use a rule-based mock that looks very intelligent
    // and uses keywords to simulate LLM context awareness.

    await new Promise((resolve) => setTimeout(resolve, 1500 + Math.random() * 1000)) // Simulate network delay

    let response = ''
    const msgLower = userMessage.toLowerCase()

    // Keyword Matching Logic (Mock AI)
    if (msgLower.includes('เชียงใหม่') || msgLower.includes('ปลอดภัยไหม')) {
        response = '📍 **สถานการณ์เชียงใหม่ปัจจุบัน (วิเคราะห์จากข้อมูล AI):**\n\n- **น้ำท่วม:** ระดับน้ำที่ ปตร. คลองลัดบางยอ อยู่ในเกณฑ์ต้องเฝ้าระวัง (1.61m)\n- **ไฟป่า:** ตรวจพบจุดความร้อนสะสม 3 จุดในรัศมี 50 กม. รอบเมือง\n\nสรุป: แนะนำให้หลีกเลี่ยงพื้นที่ริมแม่น้ำปิงครับ และสวมหน้ากาก N95 หากอยู่กลางแจ้ง เนื่องจากอาจมีฝุ่นควันจากไฟป่า'
    } else if (msgLower.includes('ไฟไหม้') || msgLower.includes('ไฟป่า')) {
        response = '🔥 ตรวจพบจุดความร้อน (Hotspots) ที่อาจเป็นไฟป่า 3 จุดครับ:\n\n1. บริเวณดอยสุเทพ (รุนแรง)\n2. พื้นที่แม่ขะจาน\n3. ทิศใต้อำเภอหางดง\n\nAI คาดการณ์ว่าไฟจะลุกลามขยายพื้นที่ประมาณ 8.5 ตร.กม. ภายใน 12 ชม. แนะนำติดตามสถานการณ์ใกล้ชิดครับ'
    } else if (msgLower.includes('น้ำท่วม') || msgLower.includes('ฝน')) {
        response = '💧 **สรุปสถานการณ์น้ำ:**\n- ปริมาณฝน 24 ชม.: 0.0 mm\n- ระดับน้ำสูงสุด: ปตร. วัดบางกระเจ้านอก (1.79m)\n- แนวโน้ม: ทรงตัว\n\nAI ประเมินความเสี่ยงน้ำท่วมรวมอยู่ในระดับ "ปานกลาง" ครับ แต่พื้นที่ลุ่มต่ำยังต้องเฝ้าระวัง'
    } else if (msgLower.includes('อพยพ') || msgLower.includes('หนี')) {
        response = '⚠️ **ข้อแนะนำการอพยพ:**\nขณะนี้ศูนย์พักพิงที่ใกล้ที่สุดคือ:\n1. โรงเรียนสนามกีฬาเทศบาลนครเชียงใหม่\n2. ศูนย์ประชุมและแสดงสินค้านานาชาติฯ\n\n*โปรดเตรียมเอกสารสำคัญและยารักษาโรคให้พร้อมครับ*'
    } else {
        // Default fallback
        response = 'เข้าใจแล้วครับ ข้อมูลนี้ทางเรากำลังติดตามและรวบรวมเพิ่มเติม \nหากต้องการดูรายละเอียด คุณสามารถซูมดูจุดเสี่ยงใน **แผนที่หลัก** ด้านซ้าย หรือคลิกเลือก **สถานีตรวจวัด** ทางขวาเพื่อดูพยากรณ์ล่วงหน้า 12 ชม. ครับ'
    }

    return {
        response
    }
})
