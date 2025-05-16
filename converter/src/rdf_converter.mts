import fs from 'fs';

interface Person {
    firstName: string;
    lastName: string;
}

interface Publisher {
    name: string;
    location: string;
}

interface Series {
    title: string;
    number?: string;
}

interface Attachment {
    id: string;
    title: string;
    url?: string;
    mimeType?: string;
    dateSubmitted?: string;
    linkMode?: string;
}

interface Memo {
    id: string;
    value: string;
}

interface ZoteroItem {
    id: string;
    itemType: string;
    title?: string;
    shortTitle?: string;
    abstract?: string;
    date?: string;
    language?: string;
    libraryCatalog?: string;
    numPages?: string;
    numberOfVolumes?: string;
    edition?: string;
    extra?: string;
    description?: string;
    volume?: string;
    archive?: string;
    archiveLocation?: string;
    callNumber?: string;
    rights?: string;
    isbn?: string;
    publisher?: Publisher;
    series?: Series;
    authors?: Person[];
    editors?: Person[];
    seriesEditors?: Person[];
    contributors?: Person[];
    translators?: Person[];
    subjects?: string[];
    dateSubmitted?: string;
    url?: string;
    attachments?: Attachment[];
    memos?: Memo[];
    isReferencedBy?: string[];
}

interface ZoteroData {
    items: ZoteroItem[];
    relations: Record<string, string[]>;
}

function parseCsvToJson(csvContent: string): ZoteroData {
    idCounter = 1;

    const lines = csvContent.split('\n');
    const headers = lines[0].split(',').map(header => header.trim());

    const items: Record<string, ZoteroItem> = {};

    console.log(`Found ${lines.length} lines in CSV file`);

    const origIdToZoteroId: Record<string, string[]> = {};

    for (let i = 1; i < lines.length; i++) {
        if (!lines[i].trim()) {
            continue;
        }

        const values = parseCSVLine(lines[i]);
        if (values.length !== headers.length) continue;

        const {origId, item} = createZoteroItemFromCsv(headers, values);
        items[item.id] = item;

        origIdToZoteroId[origId] = origIdToZoteroId[origId] || [];
        origIdToZoteroId[origId].push(item.id);
    }

    const singletonIds = Object.keys(origIdToZoteroId).filter(id => origIdToZoteroId[id].length === 1);
    for (const id of singletonIds) {
        delete origIdToZoteroId[id];
    }

    return {items: Object.values(items).sort((a, b) => a.id.localeCompare(b.id)), relations: origIdToZoteroId};
}

function parseCSVLine(line: string): string[] {
    const result: string[] = [];
    let insideQuotes = false;
    let currentValue = '';

    for (let i = 0; i < line.length; i++) {
        const char = line[i];
        const nextChar = line[i + 1];

        if (char === '"' && !insideQuotes) {
            insideQuotes = true;
        } else if (char === '"' && nextChar === '"') {
            currentValue += '"';
            i++;
        } else if (char === '"' && insideQuotes) {
            insideQuotes = false;
        } else if (char === ',' && !insideQuotes) {
            result.push(currentValue);
            currentValue = '';
        } else {
            currentValue += char;
        }
    }

    result.push(currentValue);
    return result;
}

let idCounter = 1;
const newId = (prefix = '') => `${prefix}${idCounter++}`;

function createZoteroItemFromCsv(headers: string[], values: string[]): { origId: string, item: ZoteroItem } {
    const record: Record<string, string> = {};
    for (let i = 0; i < headers.length; i++) {
        record[headers[i]] = values[i] ? values[i].replace(/[^\x09\x0A\x0D\x20-\uD7FF\uE000-\uFFFD]/g, '') : '';
    }

    const item: ZoteroItem = {
        id: newId(),
        itemType: {
            "book": "book",
            "broadsheet": "document"
        }[record.type.toLowerCase()] || "book",
    };

    if (record.title) {
        item.shortTitle = record.title;
    }

    if (record.language) {
        item.language = record.language;
    }

    if (record.year) {
        item.date = record.year;
    }

    if (record.digitised_url) {
        item.url = record.digitised_url;
    }

    if (record.author) {
        item.authors = parsePersonList(record.author);
    }

    if (record.classification) {
        item.subjects = record.classification.split(';').map(s => `ustc_calssification:${s.trim()}`);
    }

    if (record.copy_location && record.copy_shelfmark) {
        item.archive = record.copy_location;
        item.archiveLocation = record.copy_shelfmark;
        item.callNumber = record.copy_shelfmark;
    }

    item.publisher = {
        location: [record.coutnry, record.place, record.region].filter(Boolean).join(', '),
        name: record.printer_name?.includes(';')
            ? record.printer_name.split(';').map(s => s.trim()).join(', ')
            : record.printer_name
    };

    item.extra = [
        record.colophon ? `Colophon: ${record.colophon}` : '',
        record.colophon ? `Colophon source: ustc` : '',
        record.format ? `Format: ${record.format}` : '',
        record.heading ? `Heading: ${record.heading}` : '',
        record.imprint ? `Imprint: ${record.imprint}` : '',
        record.is_lost ? 'Lost: true' : '',
        record.pagination ? `Pagination: ${record.pagination}` : '',
        record.signatures ? `Signatures: ${record.signatures}` : '',
    ].filter(Boolean).join("\n")

    item.attachments = [
        {
            id: newId(),
            title: 'USTC',
            url: `https://www.ustc.ac.uk/editions/${record.sn}`,
            linkMode: '3'
        }
    ]

    return {origId: record.sn, item};
}

function parsePersonList(personString: string): Person[] {
    if (!personString) return [];

    const people: Person[] = [];
    const personParts = personString.includes(';')
        ? personString.split(';')
        : [personString];

    for (const part of personParts) {
        const trimmed = part.trim();
        if (!trimmed) continue;

        if (trimmed.includes(',')) {
            const [lastName, firstName] = trimmed.split(',').map(s => s.trim());
            people.push({lastName, firstName});
        } else {
            people.push({lastName: trimmed, firstName: ''});
        }
    }

    return people;
}

function convertJsonToRdf(jsonData: ZoteroData): string {
    idCounter = 1;

    let rdf = `<rdf:RDF
 xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"
 xmlns:z="http://www.zotero.org/namespaces/export#"
 xmlns:dcterms="http://purl.org/dc/terms/"
 xmlns:bib="http://purl.org/net/biblio#"
 xmlns:foaf="http://xmlns.com/foaf/0.1/"
 xmlns:link="http://purl.org/rss/1.0/modules/link/"
 xmlns:dc="http://purl.org/dc/elements/1.1/"
 xmlns:prism="http://prismstandard.org/namespaces/1.2/basic/"
 xmlns:vcard="http://nwalsh.com/rdf/vCard#">`;

    const sortedItems = [...jsonData.items].sort((a, b) => a.id.localeCompare(b.id));

    for (const item of sortedItems) {
        rdf += processItem(item);
    }

    rdf += "\n</rdf:RDF>";

    return rdf;
}

function processItem(item: ZoteroItem): string {
    const itemTypeMap: { [key: string]: string } = {
        'book': 'bib:Book',
        'journalArticle': 'bib:Article',
        'bookSection': 'bib:BookSection',
        'webpage': 'bib:Document',
        'attachment': 'z:Attachment',
        'note': 'bib:Memo'
    };

    const itemType = itemTypeMap[item.itemType] || 'bib:Document';
    let itemXml = `\n    <${itemType} rdf:about="#item_${item.id}">
        <z:itemType>${item.itemType}</z:itemType>`;

    if (item.series) {
        itemXml += `\n        <dcterms:isPartOf>
            <bib:Series>
                <dc:title>${escapeXml(item.series.title)}</dc:title>`;

        if (item.series.number) {
            itemXml += `\n                <dc:identifier>${escapeXml(item.series.number)}</dc:identifier>`;
        }

        itemXml += `\n            </bib:Series>
        </dcterms:isPartOf>`;
    }

    if (item.publisher) {
        itemXml += `\n        <dc:publisher>
            <foaf:Organization>
                <vcard:adr>
                    <vcard:Address>
                       <vcard:locality>${escapeXml(item.publisher.location)}</vcard:locality>
                    </vcard:Address>
                </vcard:adr>
                <foaf:name>${escapeXml(item.publisher.name)}</foaf:name>
            </foaf:Organization>
        </dc:publisher>`;
    }

    if (item.authors && item.authors.length > 0) {
        const sortedAuthors = [...item.authors].sort((a, b) =>
            a.lastName.localeCompare(b.lastName) || a.firstName.localeCompare(b.firstName));
        itemXml += addPeople(sortedAuthors, 'bib:authors');
    }

    if (item.contributors && item.contributors.length > 0) {
        const sortedContributors = [...item.contributors].sort((a, b) =>
            a.lastName.localeCompare(b.lastName) || a.firstName.localeCompare(b.firstName));
        itemXml += addPeople(sortedContributors, 'bib:contributors');
    }

    if (item.editors && item.editors.length > 0) {
        const sortedEditors = [...item.editors].sort((a, b) =>
            a.lastName.localeCompare(b.lastName) || a.firstName.localeCompare(b.firstName));
        itemXml += addPeople(sortedEditors, 'bib:editors');
    }

    if (item.seriesEditors && item.seriesEditors.length > 0) {
        const sortedSeriesEditors = [...item.seriesEditors].sort((a, b) =>
            a.lastName.localeCompare(b.lastName) || a.firstName.localeCompare(b.firstName));
        itemXml += addPeople(sortedSeriesEditors, 'z:seriesEditors');
    }

    if (item.translators && item.translators.length > 0) {
        const sortedTranslators = [...item.translators].sort((a, b) =>
            a.lastName.localeCompare(b.lastName) || a.firstName.localeCompare(b.firstName));
        itemXml += addPeople(sortedTranslators, 'z:translators');
    }

    if (item.title) {
        itemXml += `\n        <dc:title>${escapeXml(item.title)}</dc:title>`;
    }

    if (item.abstract) {
        itemXml += `\n        <dcterms:abstract>${escapeXml(item.abstract)}</dcterms:abstract>`;
    }

    if (item.volume) {
        itemXml += `\n        <prism:volume>${escapeXml(item.volume)}</prism:volume>`;
    }

    if (item.numberOfVolumes) {
        itemXml += `\n        <z:numberOfVolumes>${escapeXml(item.numberOfVolumes)}</z:numberOfVolumes>`;
    }

    if (item.edition) {
        itemXml += `\n        <prism:edition>${escapeXml(item.edition)}</prism:edition>`;
    }

    if (item.date) {
        itemXml += `\n        <dc:date>${escapeXml(item.date)}</dc:date>`;
    }

    if (item.numPages) {
        itemXml += `\n        <z:numPages>${escapeXml(item.numPages)}</z:numPages>`;
    }

    if (item.language) {
        itemXml += `\n        <z:language>${escapeXml(item.language)}</z:language>`;
    }

    if (item.isbn) {
        itemXml += `\n        <dc:identifier>ISBN ${escapeXml(item.isbn)}</dc:identifier>`;
    }

    if (item.shortTitle) {
        itemXml += `\n        <z:shortTitle>${escapeXml(item.shortTitle)}</z:shortTitle>`;
    }

    if (item.url) {
        itemXml += `\n        <dc:identifier>
            <dcterms:URI><rdf:value>${escapeXml(item.url)}</rdf:value></dcterms:URI>
        </dc:identifier>`;
    }

    if (item.dateSubmitted) {
        itemXml += `\n        <dcterms:dateSubmitted>${escapeXml(item.dateSubmitted)}</dcterms:dateSubmitted>`;
    }

    if (item.archive) {
        itemXml += `\n        <z:archive>${escapeXml(item.archive)}</z:archive>`;
    }

    if (item.archiveLocation) {
        itemXml += `\n        <dc:coverage>${escapeXml(item.archiveLocation)}</dc:coverage>`;
    }

    if (item.libraryCatalog) {
        itemXml += `\n        <z:libraryCatalog>${escapeXml(item.libraryCatalog)}</z:libraryCatalog>`;
    }

    if (item.callNumber) {
        itemXml += `\n        <dc:subject>
           <dcterms:LCC><rdf:value>${escapeXml(item.callNumber)}</rdf:value></dcterms:LCC>
        </dc:subject>`;
    }

    if (item.rights) {
        itemXml += `\n        <dc:rights>${escapeXml(item.rights)}</dc:rights>`;
    }

    if (item.extra) {
        itemXml += `\n        <dc:description>${escapeXml(item.extra)}</dc:description>`;
    } else if (item.description) {
        itemXml += `\n        <dc:description>${escapeXml(item.description)}</dc:description>`;
    }

    if (item.subjects && item.subjects.length > 0) {
        const sortedSubjects = [...item.subjects].sort();
        for (const subject of sortedSubjects) {
            itemXml += `\n        <dc:subject>${escapeXml(subject)}</dc:subject>`;
        }
    }

    if (item.isReferencedBy && item.isReferencedBy.length > 0) {
        const sortedRefs = [...item.isReferencedBy].sort();
        for (const ref of sortedRefs) {
            itemXml += `\n        <dcterms:isReferencedBy rdf:resource="#item_${ref}"/>`;
        }
    }

    if (item.attachments && item.attachments.length > 0) {
        const sortedAttachments = [...item.attachments].sort((a, b) => a.id.localeCompare(b.id));
        for (const attachment of sortedAttachments) {
            itemXml += `\n        <link:link rdf:resource="#item_${attachment.id}"/>`;
        }
    }

    itemXml += `\n    </${itemType}>`;

    if (item.attachments && item.attachments.length > 0) {
        const sortedAttachments = [...item.attachments].sort((a, b) => a.id.localeCompare(b.id));
        for (const attachment of sortedAttachments) {
            itemXml += `\n    <z:Attachment rdf:about="#item_${attachment.id}">
        <z:itemType>attachment</z:itemType>
        <dc:title>${escapeXml(attachment.title)}</dc:title>`;

            if (attachment.url) {
                itemXml += `\n        <dc:identifier>
            <dcterms:URI>
                <rdf:value>${escapeXml(attachment.url)}</rdf:value>
            </dcterms:URI>
        </dc:identifier>`;
            }

            if (attachment.dateSubmitted) {
                itemXml += `\n        <dcterms:dateSubmitted>${escapeXml(attachment.dateSubmitted)}</dcterms:dateSubmitted>`;
            }

            if (attachment.linkMode) {
                itemXml += `\n        <z:linkMode>${escapeXml(attachment.linkMode)}</z:linkMode>`;
            }

            if (attachment.mimeType) {
                itemXml += `\n        <link:type>${escapeXml(attachment.mimeType)}</link:type>`;
            }

            itemXml += `\n    </z:Attachment>`;
        }
    }

    if (item.memos && item.memos.length > 0) {
        const sortedMemos = [...item.memos].sort((a, b) => a.id.localeCompare(b.id));
        for (const memo of sortedMemos) {
            itemXml += `\n    <bib:Memo rdf:about="#item_${memo.id}">
        <rdf:value>${escapeXml(memo.value)}</rdf:value>
    </bib:Memo>`;
        }
    }

    return itemXml;
}

function addPeople(people: Person[], role: string): string {
    let xml = `\n        <${role}>
            <rdf:Seq>`;

    for (const person of people) {
        xml += `\n                <rdf:li>
                    <foaf:Person>
                        <foaf:surname>${escapeXml(person.lastName)}</foaf:surname>
                        <foaf:givenName>${escapeXml(person.firstName)}</foaf:givenName>
                    </foaf:Person>
                </rdf:li>`;
    }

    xml += `\n            </rdf:Seq>
        </${role}>`;

    return xml;
}

function escapeXml(str: string): string {
    if (!str) return '';

    return str
        .replace(/[^\x09\x0A\x0D\x20-\uD7FF\uE000-\uFFFD]/g, '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;');
}

const writeOutputs = (jsonData: ZoteroData) => {
    const rdfStr = convertJsonToRdf(jsonData);
    const outputPath = inputPath.replace(/\.[^/.]+$/, '') + '.rdf';
    console.log(`Writing RDF to ${outputPath}`);
    fs.writeFileSync(outputPath, rdfStr, 'utf8');

    const relationsPath = inputPath.replace(/\.[^/.]+$/, '') + '_relations.json';
    fs.writeFileSync(relationsPath, JSON.stringify(jsonData.relations, null, 2), 'utf8');
    console.log(`Writing relations to ${relationsPath}`);

    console.log(`Successfully converted ${inputPath} to RDF file`);
}

function convertCsvFileToRdf(inputPath: string): void {
    try {
        const csvStr = fs.readFileSync(inputPath, 'utf8')
            .replace(/[^\x09\x0A\x0D\x20-\uD7FF\uE000-\uFFFD]/g, '');
        const jsonData = parseCsvToJson(csvStr);
        writeOutputs(jsonData);
    } catch (error) {
        console.error('Error converting CSV to RDF:', error);
    }
}

function convertJsonFileToRdf(inputPath: string): void {
    try {
        const jsonStr = fs.readFileSync(inputPath, 'utf8')
            .replace(/[^\x09\x0A\x0D\x20-\uD7FF\uE000-\uFFFD]/g, '');
        const jsonData = JSON.parse(jsonStr) as ZoteroData;
        writeOutputs(jsonData);
    } catch (error) {
        console.error('Error converting JSON to RDF:', error);
    }
}

function isCSVFile(filePath: string): boolean {
    return filePath.toLowerCase().endsWith('.csv');
}

if (process.argv.length < 2) {
    console.log('Usage: tsx <script> <input-file>');
    process.exit(1);
}

const inputPath = process.argv[2];

if (isCSVFile(inputPath)) {
    convertCsvFileToRdf(inputPath);
} else {
    convertJsonFileToRdf(inputPath);
}
