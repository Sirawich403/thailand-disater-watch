"""
Data Fetcher Module
ดึงข้อมูลจาก Strapi API (หรือ Nuxt server API ในโหมด demo)
"""

import requests
from datetime import datetime, timedelta

# Base URL สำหรับ Strapi backend หรือ Nuxt server API
STRAPI_BASE_URL = 'http://localhost:3000/api'


def fetch_dashboard_summary():
    """ดึงข้อมูลสรุปจาก Dashboard API"""
    try:
        response = requests.get(f'{STRAPI_BASE_URL}/dashboard/summary', timeout=10)
        response.raise_for_status()
        return response.json()
    except requests.RequestException as e:
        print(f'[Data Fetcher] Error fetching dashboard summary: {e}')
        return None


def fetch_timeseries(station_id):
    """ดึงข้อมูล Time-Series ของสถานี"""
    try:
        response = requests.get(
            f'{STRAPI_BASE_URL}/dashboard/timeseries/{station_id}',
            timeout=10,
        )
        response.raise_for_status()
        return response.json()
    except requests.RequestException as e:
        print(f'[Data Fetcher] Error fetching timeseries for {station_id}: {e}')
        return None


def prepare_prophet_data(timeseries_data):
    """
    แปลงข้อมูล time-series ให้อยู่ในรูปแบบที่ Prophet ต้องการ
    Prophet ต้องการ DataFrame ที่มีคอลัมน์ 'ds' (datetime) และ 'y' (value)

    Args:
        timeseries_data: ข้อมูลจาก API { waterLevel: [...], rainfall: [...] }

    Returns:
        tuple: (water_df, rain_df) ข้อมูลในรูปแบบ list of dict
    """
    water_data = []
    rain_data = []

    if timeseries_data and 'waterLevel' in timeseries_data:
        for item in timeseries_data['waterLevel']:
            water_data.append({
                'ds': item['datetime'],
                'y': item['level'],
            })

    if timeseries_data and 'rainfall' in timeseries_data:
        for item in timeseries_data['rainfall']:
            rain_data.append({
                'ds': item['datetime'],
                'y': item['amount'],
                'accumulated': item.get('accumulated', 0),
            })

    return water_data, rain_data


if __name__ == '__main__':
    # Test data fetching
    print('[Data Fetcher] Testing connection to API...')
    summary = fetch_dashboard_summary()
    if summary:
        print(f'[Data Fetcher] ✅ Connected! Overall risk: {summary.get("overallRisk")}')
        for station in summary.get('stations', []):
            print(f'  - {station["name"]}: {station["currentLevel"]:.2f}m ({station["riskLevel"]})')
    else:
        print('[Data Fetcher] ❌ Could not connect to API. Make sure the Nuxt server is running.')
