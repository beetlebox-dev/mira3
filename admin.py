import os
import smtplib
import time
from datetime import datetime
from threading import Thread
from pytz import timezone


ALERT_RECIPIENT = os.getenv('ALERT_RECIPIENT')
ALERT_SENDER = os.getenv('ALERT_SENDER')
ALERT_SENDER_PASS = os.getenv('ALERT_SENDER_PASS')


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

    connection = smtplib.SMTP("smtp.mail.yahoo.com", port=587)  # or port=465
    connection.starttls()  # Make connection secure
    connection.login(user=ALERT_SENDER, password=ALERT_SENDER_PASS)
    connection.sendmail(
        from_addr=ALERT_SENDER,
        to_addrs=recipient,
        msg=f"Subject: {subject}\n\n{full_message}"
    )
    connection.close()


def admin_alert_thread(subject, message, recipient='admin', datetime_header=True, timestamp_footer=True):
    alert_args = [subject, message, recipient, datetime_header, timestamp_footer]
    alert_thread = Thread(target=admin_alert, args=alert_args)
    alert_thread.start()
