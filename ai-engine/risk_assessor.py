"""
Risk Assessor Module
ประเมินความเสี่ยงน้ำท่วมจากระดับน้ำที่สถานี P.1
"""

# เกณฑ์ระดับน้ำสำหรับสถานี P.1 สะพานนวรัฐ
THRESHOLDS = {
    'S001': {'warning': 3.0, 'critical': 4.0, 'name': 'แม่แตง'},
    'S002': {'warning': 3.2, 'critical': 3.7, 'name': 'P.1 สะพานนวรัฐ'},
    'S003': {'warning': 2.8, 'critical': 3.5, 'name': 'สารภี'},
}

# ระยะเวลาเดินทางของน้ำ (ชั่วโมง)
FLOW_TIMES = {
    'S001_to_S002': 6,  # แม่แตง → P.1
    'S002_to_S003': 3,  # P.1 → สารภี
    'S001_to_S003': 9,  # แม่แตง → สารภี
}


def assess_risk(station_id, current_level, predicted_levels):
    """
    ประเมินความเสี่ยงน้ำท่วม

    Args:
        station_id: รหัสสถานี (S001, S002, S003)
        current_level: ระดับน้ำปัจจุบัน (เมตร)
        predicted_levels: รายการระดับน้ำพยากรณ์ [{'hour': 1, 'level': 2.5}, ...]

    Returns:
        dict: ผลการประเมินความเสี่ยง
    """
    thresholds = THRESHOLDS.get(station_id, THRESHOLDS['S002'])
    peak_predicted = max(p['level'] for p in predicted_levels) if predicted_levels else current_level

    # หาชั่วโมงที่จะถึงจุดสูงสุด
    peak_hour = 0
    for p in predicted_levels:
        if p['level'] == peak_predicted:
            peak_hour = p['hour']
            break

    # ประเมินระดับความเสี่ยง
    if current_level >= thresholds['critical'] or peak_predicted >= thresholds['critical']:
        risk_level = 'danger'
        risk_label = 'วิกฤต'
        risk_description = (
            f'ระดับน้ำ{thresholds["name"]}มีแนวโน้มสูงกว่า {thresholds["critical"]}m '
            f'(เกณฑ์น้ำล้นตลิ่ง) — คาดว่าจะถึงจุดสูงสุดใน {peak_hour} ชั่วโมง'
        )
    elif current_level >= thresholds['warning'] or peak_predicted >= thresholds['warning']:
        risk_level = 'warning'
        risk_label = 'เฝ้าระวัง'
        risk_description = (
            f'ระดับน้ำ{thresholds["name"]}สูงกว่าเกณฑ์เฝ้าระวัง ({thresholds["warning"]}m) '
            f'— กรุณาติดตามสถานการณ์'
        )
    else:
        risk_level = 'safe'
        risk_label = 'ปกติ'
        risk_description = f'ระดับน้ำ{thresholds["name"]}อยู่ในเกณฑ์ปกติ'

    # คำนวณเวลาที่น้ำจะถึงจุดปลายน้ำ
    flow_time_downstream = None
    if station_id == 'S001' and risk_level != 'safe':
        flow_time_downstream = {
            'to_P1': FLOW_TIMES['S001_to_S002'],
            'to_saraphi': FLOW_TIMES['S001_to_S003'],
        }
    elif station_id == 'S002' and risk_level != 'safe':
        flow_time_downstream = {
            'to_saraphi': FLOW_TIMES['S002_to_S003'],
        }

    return {
        'station_id': station_id,
        'station_name': thresholds['name'],
        'current_level': current_level,
        'peak_predicted': round(peak_predicted, 2),
        'peak_hour': peak_hour,
        'risk_level': risk_level,
        'risk_label': risk_label,
        'risk_description': risk_description,
        'thresholds': thresholds,
        'flow_time_downstream': flow_time_downstream,
    }
