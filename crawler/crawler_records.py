import json
import csv
import requests
import html
import concurrent.futures
from pathlib import Path
from typing import Dict, List, Any, Set
from tqdm import tqdm

INPUT_FILE_PATH = 'out/ids.json'
OUT_FILE_PATH = 'out/records.csv'


def load_ids() -> List[str]:
    with open(INPUT_FILE_PATH) as f:
        return json.load(f)


def role_to_person_type(role):
    return {
        "Commentator": "contributor",
        "Contributor": "contributor",
        "Defendant": "contributor",
        "Editor": "editor",
        "Engraver": "contributor",
        "Illustrator": "contributor",
        "Principal Author": "author",
        "Proponent": "contributor",
        "Pseudonym": "author",
        "Respondent": "contributor",
        "Translator": "translator",
    }[role] or "author"


def parse_record(data):
    results = []
    edition = data["props"]["edition"]
    digitisations = data["props"].get("digitisations", [])
    copies = data["props"].get("copies", [])

    edition_data = {
        'is_lost': False,
        'digitised_url': '',
        'copy_location': '',
        'copy_shelfmark': '',
    }

    field_groups = {}

    for key, value in edition.items():
        if "_" in key:
            if key.startswith("std_"):
                key = key[4:]
                edition_data[key] = value
                continue
            base_name, suffix = key.rsplit("_", 1)
            if suffix.isdigit():
                if base_name == "author":
                    role = edition[f"role_{suffix}"]
                    base_name = role_to_person_type(role)
                if base_name not in field_groups:
                    field_groups[base_name] = []
                field_groups[base_name].append(key)
                continue
            if base_name not in ["female", "created", "updated", "fingerprint"]:
                edition_data[key] = value
        elif key not in ["id"]:
            edition_data[key] = value

    for base_name, fields in field_groups.items():
        if base_name == "author_role":
            continue
        fields.sort()
        values = [edition[field] for field in fields if edition[field]]
        if values:
            edition_data[base_name] = ";".join(sorted(values))

    edition_data["is_digitised"] = len(digitisations) > 0
    edition_data["has_copies"] = len(copies) > 0

    if len(digitisations) == 0 and len(copies) == 0:
        row = edition_data.copy()
        row["is_lost"] = True
        results.append(row)

    for digitisation in digitisations:
        if digitisation:
            row = edition_data.copy()
            row["digitised_url"] = digitisation.get("url", "")
            results.append(row)

    for copy in copies:
        if copy:
            row = edition_data.copy()
            row["copy_location"] = f"{copy.get('name', '')} ({copy.get('city', '')}, {copy.get('country', '')})"
            row["copy_shelfmark"] = copy.get("shelfmark", "")
            results.append(row)

    return results


def process_id(id: str) -> List[Dict[str, Any]]:
    url = f"https://www.ustc.ac.uk/editions/{id}"
    try:
        response = requests.get(url)
        if response.status_code == 200:
            html_content = response.text

            data_page_start = html_content.find('data-page="')
            if data_page_start != -1:
                data_page_start += len('data-page="')
                data_page_end = html_content.find('"', data_page_start)
                if data_page_end != -1:
                    data_page_json = html_content[data_page_start:data_page_end]
                    data_page_json = html.unescape(data_page_json)
                    page_data = json.loads(data_page_json)
                    return parse_record(page_data)

            print(f"Could not extract data for ID {id}")
            return []
        else:
            print(f"Error fetching record for ID {id}: Status code {response.status_code}")
            return []
    except Exception as e:
        print(f"Exception processing ID {id}: {str(e)}")
        return []


def write_csv(data: List[Dict[str, Any]], output_file: str):
    if not data:
        print("No data to write to CSV")
        return

    fieldnames = set()
    for row in data:
        fieldnames.update(row.keys())

    with open(output_file, 'w', newline='') as f:
        writer = csv.DictWriter(f, fieldnames=sorted(fieldnames))
        writer.writeheader()
        writer.writerows(data)


def main():
    ids = load_ids()

    # ids = ['75104', '2034843', '804919']

    print(f"Loaded {len(ids)} test IDs")

    all_results = []

    with concurrent.futures.ThreadPoolExecutor(max_workers=16) as executor:
        futures = {executor.submit(process_id, id): id for id in ids}

        processed_count = 0
        total_entries = 0

        for future in tqdm(concurrent.futures.as_completed(futures), total=len(futures), desc="Processing records"):
            id = futures[future]
            try:
                results = future.result()
                all_results.extend(results)
                processed_count += 1
                total_entries += len(results)
            except Exception as e:
                tqdm.write(f"Error processing record {id}: {str(e)}")

    output_file = Path(OUT_FILE_PATH)
    print(f"Writing {total_entries} entries to {output_file}")
    write_csv(all_results, output_file)
    print(f"Wrote {len(all_results)} records to {output_file}")


if __name__ == "__main__":
    main()
