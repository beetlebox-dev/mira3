import os
import shutil


# Simulates the google.cloud.storage module as it runs on the Google server.


class Blob:

    def __init__(self, file_path):
        self.file_path = file_path

    def open(self, mode):
        return open(self.file_path, mode)

    def delete(self):
        os.remove(self.file_path)

    def upload_from_string(self, contents_str):
        with open(self.file_path, 'w') as file:
            file.write(str(contents_str))

    def upload_from_filename(self, source_file_path):
        with open(source_file_path, 'rb') as source_file:
            source_file_bytes = source_file.read()
        with self.open('wb') as destination_file:
            destination_file.write(source_file_bytes)

    def download_to_filename(self, destination_file_path):
        with self.open('rb') as source_file:
            source_file_bytes = source_file.read()
        with open(destination_file_path, 'wb') as destination_file:
            destination_file.write(source_file_bytes)


class Bucket:

    def __init__(self, bucket_name):
        # self.__bucket_name = bucket_name
        pass

    def blob(self, file_path):
        return Blob(file_path)

    def copy_blob(self, blob, destination_bucket, new_name=None):
        if new_name is None:
            new_name = f'{blob.file_path}_copy'
        shutil.copy(blob.file_path, new_name)


class Client:
    def bucket(self, bucket_name):
        return Bucket(bucket_name)
