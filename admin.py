import requests
import os
import time
from datetime import datetime
from threading import Thread

from pytz import timezone
from gmail_api import send_gmail


IP_API_ENDPOINT = 'https://api.ipgeolocation.io/ipgeo'
IP_API_KEY = os.getenv('IP_API_KEY')
ALERT_RECIPIENT = os.getenv('ALERT_RECIPIENT')


def admin_alert(subject, message, recipient='admin', datetime_header=True, timestamp_footer=True):

    if recipient == 'admin':
        recipient = ALERT_RECIPIENT

    full_message = ''

    if datetime_header:
        pacific_tz = timezone("US/Pacific")
        time_to_format = datetime.fromtimestamp(time.time(), tz=pacific_tz)
        second = round(float(time_to_format.strftime("%S.%f")), 2)
        formatted_datetime = time_to_format.strftime(f"%Y-%m-%d %H:%M:{second}")
        full_message += f'{formatted_datetime}\n'

    full_message += message

    if timestamp_footer:
        full_message += f'\n{time.time()}'

    # print(f"*****************\nSubject: {subject}\n{message}\n*****************")

    send_gmail(recipient, subject, message)


def admin_alert_thread(subject, message, recipient='admin', datetime_header=True, timestamp_footer=True):
    alert_args = [subject, message, recipient, datetime_header, timestamp_footer]
    alert_thread = Thread(target=admin_alert, args=alert_args)
    alert_thread.start()


def login_alert(ip_addr, user_id):

    api_params = {
        'apiKey': IP_API_KEY,
        'ip': ip_addr,
        'fields': 'geo',
        'excludes': 'continent_code,continent_name,country_code2,country_code3',
    }

    api_response = requests.get(IP_API_ENDPOINT, params=api_params)
    # if api_response.status_code != 200:
    #     # API call unsuccessful.
    #     pass

    message = f'KID APP\nUser "{user_id}" logged in successfully.\n\n{api_response.text}'
    admin_alert('Web App - Log', message)


def login_alert_thread(ip_addr, user_id):
    alert_args = [ip_addr, user_id]
    alert_thread = Thread(target=login_alert, args=alert_args)
    alert_thread.start()
