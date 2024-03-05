import json
import os
from google.cloud import storage  # pip install --upgrade google-cloud-storage


def create_directory_if_needed(file_path):
    # Create new directory if one does not exist.
    file_path_split = file_path.rsplit('/', 1)  # Split in 2 segments at the rightmost '/'.
    if len(file_path_split) < 2:
        file_path_directory = ''
    else:
        file_path_directory = file_path_split[0]  # Path without file.
    if not os.path.exists(file_path_directory):
        # Create new directories in path that do not exist.
        os.makedirs(file_path_directory)


class Serve:
    """For store_top_folder and temp_top_folder at init,
path strings must end with a forward slash, i.e. 'parent_folder/child_folder/'."""

    def __init__(self, store_bucket_name, store_top_folder, temp_top_folder):
        self.bucket = None
        self.blobs = {}
        self.store_bucket_name = store_bucket_name
        self.store_top_folder = store_top_folder
        self.temp_top_folder = temp_top_folder

    def temp_full_path(self, file_path):
        full_path = f'{self.temp_top_folder}{file_path}'
        return full_path

    def get_bucket(self):
        storage_client = storage.Client()
        self.bucket = storage_client.bucket(self.store_bucket_name)

    def get_blob(self, file_path):
        if file_path not in self.blobs:
            if self.bucket is None:
                self.get_bucket()
            full_path = f'{self.store_top_folder}{file_path}'
            blob = self.bucket.blob(full_path)
            self.blobs[file_path] = blob
        return self.blobs[file_path]

    def open(self, file_path, mode, location):
        """Location can be 'temp' or 'store'."""
        if location == 'temp':
            full_path = self.temp_full_path(file_path)
            create_directory_if_needed(full_path)
            return open(full_path, mode)
        else:
            blob = self.get_blob(file_path)
            return blob.open(mode)

    def receive(self, file_path, location='temp', return_string=False):
        """If return_string is True, a string is returned regardless of the source file type.
Otherwise, a dictionary is returned from json files, or a list of lines from non-json files (i.e. txt)."""
        with self.open(file_path, 'r', location) as file:
            if return_string:
                return file.read()
            elif file_path[-5:] == '.json':
                server_dict = json.load(file)
                return server_dict
            else:
                whole_str = file.read()
                line_list = whole_str.split('\n')
                return line_list

    # TODO: thread?
    def send(self, file_path, new_contents, location='temp'):
        with self.open(file_path, 'w', location) as file:
            if isinstance(new_contents, dict) or isinstance(new_contents, list):
                json.dump(new_contents, file, indent=4)
            else:
                file.write(str(new_contents))
        if file_path in self.blobs:
            # New blob must be opened next time.
            del self.blobs[file_path]

    # # TODO: untested
    # def append(self, file_path, new_lines, location='temp'):
    #     """New_lines is a list. Do not use for json files!"""
    #     if location == 'temp':
    #         new_str = '\n' + '\n'.join(new_lines)
    #         with self.open(file_path, 'a', 'temp') as file:
    #             file.write(new_str)  # TODO: thread?
    #     else:
    #         existing_lines = self.receive(file_path, 'store')
    #         # if len(existing_lines) == 0:  # TODO: Empty file returns [''] or []? Always start witn \n?
    #         #     existing_lines.append('')
    #         existing_lines.extend(new_lines)
    #         new_str = '\n'.join(existing_lines)
    #         self.send(file_path, new_str)

    def file_to_store_from_temp(self, store_file_path, temp_file_path=None):  # TODO: thread?
        """If temp_file_path is not passed in, the corresponding temp path from store_file_path will be calculated."""
        if temp_file_path is None:
            temp_file_path = self.temp_full_path(store_file_path)
        blob = self.get_blob(store_file_path)
        blob.upload_from_filename(temp_file_path)

    def file_from_store_to_temp(self, store_file_path, temp_file_path=None):
        """If temp_file_path is not passed in, the corresponding temp path from store_file_path will be calculated."""
        if temp_file_path is None:
            temp_file_path = self.temp_full_path(store_file_path)
        create_directory_if_needed(temp_file_path)
        blob = self.get_blob(store_file_path)
        blob.download_to_filename(temp_file_path)
