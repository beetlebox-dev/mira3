
# Simulates the google.cloud.storage module as it runs on the Google server.


class Blob:

    def __init__(self, file_path):
        self.file_path = file_path

    def open(self, mode):
        return open(self.file_path, mode)

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

    # Nothing is done with the init variable.
    def __init__(self, foo):
        pass

    def blob(self, file_path):
        return Blob(file_path)


class Client:

    # Nothing is done with the init variable.
    def bucket(self, foo):
        return Bucket(foo)
