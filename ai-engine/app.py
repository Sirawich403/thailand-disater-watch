"""
CM Flood Watch — AI Prediction Engine
Flask REST API สำหรับพยากรณ์ระดับน้ำ

Endpoints:
  GET  /health           — Health check
  POST /predict          — รับข้อมูลและคืนค่าพยากรณ์
  GET  /predict/:stationId — พยากรณ์จากข้อมูลล่าสุดใน Nuxt API
"""

from flask import Flask, jsonify, request
from flask_cors import CORS
from datetime import datetime

from model import predict_water_level_prophet
from risk_assessor import assess_risk
from data_fetcher import fetch_timeseries, prepare_prophet_data

app = Flask(__name__)
CORS(app)


@app.route('/health', methods=['GET'])
def health():
    """Health check endpoint"""
    return jsonify({
        'status': 'healthy',
        'service': 'CM Flood Watch AI Engine',
        'timestamp': datetime.now().isoformat(),
        'version': '1.0.0',
    })


@app.route('/predict', methods=['POST'])
def predict():
    """
    รับข้อมูลและพยากรณ์ระดับน้ำ

    Request body:
    {
        "station_id": "S002",
        "water_data": [{"ds": "2024-01-01T00:00:00", "y": 2.5}, ...],
        "hours_ahead": 12
    }
    """
    data = request.get_json()

    if not data:
        return jsonify({'error': 'No data provided'}), 400

    station_id = data.get('station_id', 'S002')
    water_data = data.get('water_data', [])
    hours_ahead = data.get('hours_ahead', 12)

    if not water_data:
        return jsonify({'error': 'water_data is required'}), 400

    # รันพยากรณ์
    predictions = predict_water_level_prophet(water_data, hours_ahead)

    # ประเมินความเสี่ยง
    current_level = water_data[-1]['y'] if water_data else 0
    risk = assess_risk(station_id, current_level, predictions)

    return jsonify({
        'station_id': station_id,
        'predictions': predictions,
        'risk_assessment': risk,
        'model_type': 'prophet' if len(water_data) >= 10 else 'fallback',
        'generated_at': datetime.now().isoformat(),
    })


@app.route('/predict/<station_id>', methods=['GET'])
def predict_station(station_id):
    """
    ดึงข้อมูลจาก Nuxt API แล้วพยากรณ์อัตโนมัติ

    URL params:
        station_id: S001, S002, or S003
        hours_ahead: (optional, default 12)
    """
    hours_ahead = request.args.get('hours_ahead', 12, type=int)

    # ดึงข้อมูลจาก Nuxt server
    timeseries = fetch_timeseries(station_id)

    if not timeseries:
        return jsonify({
            'error': f'Could not fetch data for station {station_id}. '
                     'Make sure the Nuxt server is running on port 3000.',
        }), 503

    # แปลงข้อมูลเป็นรูปแบบ Prophet
    water_data, rain_data = prepare_prophet_data(timeseries)

    if not water_data:
        return jsonify({'error': 'No water level data available'}), 404

    # รันพยากรณ์
    predictions = predict_water_level_prophet(water_data, hours_ahead)

    # ประเมินความเสี่ยง
    current_level = water_data[-1]['y']
    risk = assess_risk(station_id, current_level, predictions)

    # เพิ่มข้อมูลฝนสะสม
    total_rain_24h = 0
    if rain_data:
        last_24h = rain_data[-24:] if len(rain_data) >= 24 else rain_data
        total_rain_24h = sum(d['y'] for d in last_24h)

    return jsonify({
        'station_id': station_id,
        'current_level': current_level,
        'predictions': predictions,
        'risk_assessment': risk,
        'rainfall_24h': round(total_rain_24h, 1),
        'data_points_used': len(water_data),
        'model_type': 'prophet' if len(water_data) >= 10 else 'fallback',
        'generated_at': datetime.now().isoformat(),
    })


if __name__ == '__main__':
    print('=' * 50)
    print('  CM Flood Watch — AI Prediction Engine')
    print('  http://localhost:5000')
    print('=' * 50)
    print()
    print('Endpoints:')
    print('  GET  /health')
    print('  POST /predict')
    print('  GET  /predict/<station_id>')
    print()
    app.run(host='0.0.0.0', port=5000, debug=True)
