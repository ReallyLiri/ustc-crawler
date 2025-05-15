import json
import pathlib
import re
import os

import requests

BASE_URL = "https://www.ustc.ac.uk/explore"

OUTPUT_DIR = "out"
OUTPUT_FILENAME = "ids.json"


def fetch_page(page=1):
    params = {"fqs": "Mathematics", "pg": page}
    response = requests.get(BASE_URL, params=params)
    response.raise_for_status()
    return response.text


def parse_ids_from_page(html):
    ids = []

    # Find the JSON data in the page data-page attribute
    match = re.search(r'data-page="(.*?)"', html, re.DOTALL)
    if match:
        try:
            # Escape HTML entities and clean the JSON string properly
            json_str = match.group(1).replace('&quot;', '"')
            json_str = json_str.replace('&amp;', '&')

            # Try to parse the JSON data
            data = json.loads(json_str)

            # Extract book records from the data structure
            if 'props' in data and 'results' in data['props'] and 'data' in data['props']['results']:
                for item in data['props']['results']['data']:
                    if 'attributes' in item and 'sn' in item['attributes']:
                        ids.append(item['attributes']['sn'])

                # Check if we got any IDs, if not print message
                if not ids:
                    print("No IDs found in page data structure")
        except json.JSONDecodeError as e:
            print(f"Failed to parse JSON data from page: {e}")
    else:
        print("Could not find data-page attribute in HTML")

    return ids


def crawl_pages():
    all_ids = []
    page = 1
    while True:
        try:
            html = fetch_page(page)
        except requests.RequestException as e:
            print(f"Failed to fetch page {page}: {e}")
            break

        ids_on_page = parse_ids_from_page(html)
        if not ids_on_page:
            break

        all_ids.extend(ids_on_page)
        print(f"Page {page}: collected {len(ids_on_page)} IDs")

        match = re.search(r'data-page="(.*?)"', html, re.DOTALL)
        if match:
            try:
                json_str = match.group(1).replace('&quot;', '"')
                json_str = json_str.replace('&amp;', '&')

                data = json.loads(json_str)
                if ('props' in data and 'results' in data['props'] and
                        'meta' in data['props']['results'] and
                        'pagination' in data['props']['results']['meta']):

                    pagination = data['props']['results']['meta']['pagination']
                    if not pagination.get('next'):
                        print("Reached last page based on pagination data")
                        break
                else:
                    print("Could not find pagination data in JSON")
                    break
            except json.JSONDecodeError as e:
                print(f"Failed to parse JSON for pagination check: {e}")
                break
        else:
            print("Could not find data-page attribute for pagination check")
            break

        page += 1

    all_ids = list(set(all_ids))
    return all_ids


if __name__ == "__main__":
    try:
        ids = crawl_pages()
        print(f"Total document IDs found: {len(ids)}")

        os.makedirs(OUTPUT_DIR, exist_ok=True)
        output_file_path = os.path.join(OUTPUT_DIR, OUTPUT_FILENAME)
        with open(output_file_path, "w") as f:
            json.dump(ids, f, indent=4)

        print(f"Saved all IDs to '{output_file_path}'.")
    except Exception as e:
        print(f"Error during crawl: {e}")
