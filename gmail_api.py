import os.path
import base64
from email.message import EmailMessage

# pip install --upgrade google-api-python-client google-auth-httplib2 google-auth-oauthlib
from google.auth.transport.requests import Request
from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import InstalledAppFlow
from googleapiclient.discovery import build
from googleapiclient.errors import HttpError

from persist import Serve


GMAIL_SENDER_ADDRESS = os.getenv('GMAIL_SENDER_ADDRESS')
STORE_BUCKET_NAME = 'app-storage-bucket'
STORE_TOP_FOLDER = 'gmail_api_store/'
TEMP_TOP_FOLDER = 'gmail_api_temp/'


# If modifying these scopes, delete the file token.json.
SCOPES = ["https://www.googleapis.com/auth/gmail.send", ]
# SCOPES = ["https://www.googleapis.com/auth/gmail.readonly", ]
# SCOPES = ["https://mail.google.com/", ]  # Full access.


def send_gmail(to_addr, subject, message_text):

    # Encode email data.
    email_obj = EmailMessage()
    email_obj["From"] = GMAIL_SENDER_ADDRESS
    email_obj["To"] = to_addr
    email_obj["Subject"] = subject
    email_obj.set_content(message_text)
    encoded_email_bytes = base64.urlsafe_b64encode(email_obj.as_bytes()).decode()

    # Retrieve credentials.json and token.json.
    serve = Serve(STORE_BUCKET_NAME, STORE_TOP_FOLDER, TEMP_TOP_FOLDER)
    if not os.path.exists(serve.temp_full_path('credentials.json')):
        serve.file_from_store_to_temp('credentials.json')
    if not os.path.exists(serve.temp_full_path('token.json')):
        try:
            serve.file_from_store_to_temp('token.json')
        except Exception as e:
            print(f'Unable to retrieve token.json at store. Will attempt to create. \nException thrown: {e}')

    # Prepare gmail api credentials.
    creds = None
    # The file token.json stores the user's access and refresh tokens,
    # and is created automatically when the authorization flow completes for the first time.
    if os.path.exists(serve.temp_full_path('token.json')):
        creds = Credentials.from_authorized_user_file(serve.temp_full_path('token.json'), SCOPES)
    # If there are no (valid) credentials available, let the user log in.
    if not creds or not creds.valid:
        if creds and creds.expired and creds.refresh_token:
            creds.refresh(Request())
        else:
            flow = InstalledAppFlow.from_client_secrets_file(serve.temp_full_path('credentials.json'), SCOPES)
            creds = flow.run_local_server(port=0)
        # Save the credentials for the next run.
        # with open(serve.temp_full_path('token.json'), 'w') as token:
        #     token.write(creds.to_json())
        serve.send('token.json', creds.to_json(), 'temp')
        serve.file_to_store_from_temp('token.json')

    # Send email.
    try:
        service = build("gmail", "v1", credentials=creds)
        sent_message = service.users().messages().send(userId="me", body={"raw": encoded_email_bytes}).execute()
        print(f'Sent Message | Subject: {subject} | Id: {sent_message["id"]}')
    except HttpError as error:
        # TODO(developer) - Handle errors from gmail API.
        print(error)
