"""
AI Prediction Model Module
โมเดล Time-Series Forecasting สำหรับพยากรณ์ระดับน้ำ

ใช้ Facebook Prophet ในการพยากรณ์
(ถ้าไม่มี Prophet จะ fallback เป็น Simple Moving Average)
"""

import numpy as np
from datetime import datetime, timedelta

try:
    from prophet import Prophet
    PROPHET_AVAILABLE = True
except ImportError:
    PROPHET_AVAILABLE = False
    print('[Model] Prophet not installed. Using fallback prediction model.')

try:
    import pandas as pd
    PANDAS_AVAILABLE = True
except ImportError:
    PANDAS_AVAILABLE = False
    print('[Model] Pandas not installed. Using basic numpy arrays.')


def predict_water_level_prophet(water_data, hours_ahead=12):
    """
    พยากรณ์ระดับน้ำด้วย Facebook Prophet

    Args:
        water_data: list of dict [{'ds': datetime_str, 'y': float}, ...]
        hours_ahead: จำนวนชั่วโมงที่ต้องการพยากรณ์

    Returns:
        list of dict: ผลพยากรณ์
    """
    if not PROPHET_AVAILABLE or not PANDAS_AVAILABLE:
        return predict_water_level_fallback(water_data, hours_ahead)

    if len(water_data) < 10:
        return predict_water_level_fallback(water_data, hours_ahead)

    try:
        df = pd.DataFrame(water_data)
        df['ds'] = pd.to_datetime(df['ds'])

        # สร้างโมเดล Prophet
        model = Prophet(
            changepoint_prior_scale=0.05,
            seasonality_prior_scale=10,
            daily_seasonality=True,
            weekly_seasonality=False,
            yearly_seasonality=False,
        )

        # เพิ่ม custom seasonality สำหรับรอบ 12 ชั่วโมง (น้ำขึ้นน้ำลง)
        model.add_seasonality(name='half_daily', period=0.5, fourier_order=3)

        model.fit(df[['ds', 'y']])

        # สร้าง future dataframe
        future = model.make_future_dataframe(periods=hours_ahead, freq='h')
        forecast = model.predict(future)

        # ดึงเฉพาะผลพยากรณ์ในอนาคต
        future_forecast = forecast.tail(hours_ahead)
        predictions = []
        for i, (_, row) in enumerate(future_forecast.iterrows(), 1):
            predictions.append({
                'hour': i,
                'datetime': row['ds'].isoformat(),
                'level': round(max(0, row['yhat']), 2),
                'level_upper': round(max(0, row['yhat_upper']), 2),
                'level_lower': round(max(0, row['yhat_lower']), 2),
                'confidence': round(max(0, 100 - i * 2.5), 1),
            })

        return predictions

    except Exception as e:
        print(f'[Model] Prophet prediction failed: {e}. Using fallback.')
        return predict_water_level_fallback(water_data, hours_ahead)


def predict_water_level_fallback(water_data, hours_ahead=12):
    """
    Fallback prediction using weighted moving average + trend analysis
    ใช้เมื่อไม่มี Prophet

    Args:
        water_data: list of dict [{'ds': datetime_str, 'y': float}, ...]
        hours_ahead: จำนวนชั่วโมงที่ต้องการพยากรณ์

    Returns:
        list of dict: ผลพยากรณ์
    """
    if not water_data:
        return []

    values = [d['y'] for d in water_data]
    n = len(values)

    # คำนวณ trend ด้วย linear regression อย่างง่าย
    if n >= 6:
        recent = values[-6:]
        x = np.arange(len(recent))
        coeffs = np.polyfit(x, recent, 1)
        trend = coeffs[0]  # slope
    else:
        trend = 0

    # Weighted moving average (ให้น้ำหนักข้อมูลล่าสุดมากกว่า)
    window = min(12, n)
    weights = np.exp(np.linspace(-1, 0, window))
    weights /= weights.sum()
    base_level = np.average(values[-window:], weights=weights)

    # สร้างพยากรณ์
    last_time = datetime.fromisoformat(water_data[-1]['ds'].replace('Z', '+00:00'))
    predictions = []

    for h in range(1, hours_ahead + 1):
        # Level = base + trend * h + daily cycle + damping
        daily_cycle = 0.05 * np.sin((h / 12) * np.pi)
        damping = 0.95 ** h  # trend จะค่อยๆ ลดลง
        predicted = base_level + trend * h * damping + daily_cycle
        predicted = max(0.5, predicted)

        # Confidence interval
        uncertainty = 0.1 * np.sqrt(h)

        predictions.append({
            'hour': h,
            'datetime': (last_time + timedelta(hours=h)).isoformat(),
            'level': round(predicted, 2),
            'level_upper': round(predicted + uncertainty, 2),
            'level_lower': round(max(0, predicted - uncertainty), 2),
            'confidence': round(max(50, 95 - h * 3), 1),
        })

    return predictions


if __name__ == '__main__':
    # Test with sample data
    print('[Model] Testing prediction model...')
    print(f'[Model] Prophet available: {PROPHET_AVAILABLE}')

    # Generate sample data
    sample_data = []
    base = 2.5
    now = datetime.now()
    for i in range(48):
        t = now - timedelta(hours=48 - i)
        level = base + 0.5 * np.sin(i / 12 * np.pi) + np.random.normal(0, 0.05)
        sample_data.append({
            'ds': t.isoformat(),
            'y': round(max(0, level), 2),
        })

    predictions = predict_water_level_prophet(sample_data, hours_ahead=12)
    print(f'[Model] Generated {len(predictions)} predictions:')
    for p in predictions:
        print(f'  Hour +{p["hour"]}: {p["level"]:.2f}m '
              f'(CI: {p["level_lower"]:.2f} - {p["level_upper"]:.2f}) '
              f'confidence: {p["confidence"]}%')
