import fs from 'fs';

// Define types based on the JSON schema
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

interface ZoteroCollection {
    id: string;
    name: string;
    items?: string[];
    parentCollection?: string;
}

interface ZoteroData {
    items: ZoteroItem[];
    collections?: ZoteroCollection[];
}

/**
 * Converts JSON data to Zotero RDF format
 * @param jsonData The JSON data conforming to the schema
 * @returns A string containing the RDF XML
 */
function convertJsonToRdf(jsonData: ZoteroData): string {
    // Create XML header with all required namespaces
    let rdf = `<?xml version="1.0" encoding="utf-8"?>
<rdf:RDF
 xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"
 xmlns:z="http://www.zotero.org/namespaces/export#"
 xmlns:dc="http://purl.org/dc/elements/1.1/"
 xmlns:vcard="http://nwalsh.com/rdf/vCard#"
 xmlns:foaf="http://xmlns.com/foaf/0.1/"
 xmlns:bib="http://purl.org/net/biblio#"
 xmlns:link="http://purl.org/rss/1.0/modules/link/"
 xmlns:dcterms="http://purl.org/dc/terms/"
 xmlns:prism="http://prismstandard.org/namespaces/1.2/basic/">`;

    // Process each item
    for (const item of jsonData.items) {
        rdf += processItem(item);
    }

    // Close the RDF tag
    rdf += '\n</rdf:RDF>';

    return rdf;
}

/**
 * Process a single Zotero item
 * @param item The item to process
 * @returns RDF XML fragment for the item
 */
function processItem(item: ZoteroItem): string {
    // Map Zotero item types to RDF element types
    const itemTypeMap: { [key: string]: string } = {
        'book': 'bib:Book',
        'journalArticle': 'bib:Article',
        'bookSection': 'bib:BookSection',
        'webpage': 'bib:Document',
        'attachment': 'z:Attachment',
        'note': 'bib:Memo'
        // Add more mappings as needed
    };

    const itemType = itemTypeMap[item.itemType] || 'bib:Document';
    let itemXml = `\n    <${itemType} rdf:about="#item_${item.id}">
        <z:itemType>${item.itemType}</z:itemType>`;

    // Add series information
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

    // Add publisher information
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

    // Add people in different roles

    // Add authors
    if (item.authors && item.authors.length > 0) {
        itemXml += addPeople(item.authors, 'bib:authors');
    }

    // Add contributors
    if (item.contributors && item.contributors.length > 0) {
        itemXml += addPeople(item.contributors, 'bib:contributors');
    }

    // Add editors
    if (item.editors && item.editors.length > 0) {
        itemXml += addPeople(item.editors, 'bib:editors');
    }

    // Add series editors
    if (item.seriesEditors && item.seriesEditors.length > 0) {
        itemXml += addPeople(item.seriesEditors, 'z:seriesEditors');
    }

    // Add translators
    if (item.translators && item.translators.length > 0) {
        itemXml += addPeople(item.translators, 'z:translators');
    }

    // Add basic metadata
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

    // Add ISBN
    if (item.isbn) {
        itemXml += `\n        <dc:identifier>ISBN ${escapeXml(item.isbn)}</dc:identifier>`;
    }

    // Add short title
    if (item.shortTitle) {
        itemXml += `\n        <z:shortTitle>${escapeXml(item.shortTitle)}</z:shortTitle>`;
    }

    // Add URL
    if (item.url) {
        itemXml += `\n        <dc:identifier>
            <dcterms:URI><rdf:value>${escapeXml(item.url)}</rdf:value></dcterms:URI>
        </dc:identifier>`;
    }

    // Add date submitted
    if (item.dateSubmitted) {
        itemXml += `\n        <dcterms:dateSubmitted>${escapeXml(item.dateSubmitted)}</dcterms:dateSubmitted>`;
    }

    // Add archive info
    if (item.archive) {
        itemXml += `\n        <z:archive>${escapeXml(item.archive)}</z:archive>`;
    }

    if (item.archiveLocation) {
        itemXml += `\n        <dc:coverage>${escapeXml(item.archiveLocation)}</dc:coverage>`;
    }

    // Add library catalog
    if (item.libraryCatalog) {
        itemXml += `\n        <z:libraryCatalog>${escapeXml(item.libraryCatalog)}</z:libraryCatalog>`;
    }

    // Add call number
    if (item.callNumber) {
        itemXml += `\n        <dc:subject>
           <dcterms:LCC><rdf:value>${escapeXml(item.callNumber)}</rdf:value></dcterms:LCC>
        </dc:subject>`;
    }

    // Add rights
    if (item.rights) {
        itemXml += `\n        <dc:rights>${escapeXml(item.rights)}</dc:rights>`;
    }

    // Add extra/description
    if (item.extra) {
        itemXml += `\n        <dc:description>${escapeXml(item.extra)}</dc:description>`;
    } else if (item.description) {
        itemXml += `\n        <dc:description>${escapeXml(item.description)}</dc:description>`;
    }

    // Add subjects
    if (item.subjects && item.subjects.length > 0) {
        for (const subject of item.subjects) {
            itemXml += `\n        <dc:subject>${escapeXml(subject)}</dc:subject>`;
        }
    }

    // Add references
    if (item.isReferencedBy && item.isReferencedBy.length > 0) {
        for (const ref of item.isReferencedBy) {
            itemXml += `\n        <dcterms:isReferencedBy rdf:resource="#item_${ref}"/>`;
        }
    }

    // Close the item element
    itemXml += `\n    </${itemType}>`;

    // Add attachments
    if (item.attachments && item.attachments.length > 0) {
        for (const attachment of item.attachments) {
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

    // Add memos (notes)
    if (item.memos && item.memos.length > 0) {
        for (const memo of item.memos) {
            itemXml += `\n    <bib:Memo rdf:about="#item_${memo.id}">
        <rdf:value>${escapeXml(memo.value)}</rdf:value>
    </bib:Memo>`;
        }
    }

    return itemXml;
}

/**
 * Helper function to add people (authors, editors, etc.)
 * @param people Array of Person objects
 * @param role Role tag (bib:authors, bib:editors, etc.)
 * @returns RDF XML fragment for the people
 */
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

/**
 * Escape XML special characters
 * @param str Input string
 * @returns Escaped string
 */
function escapeXml(str: string): string {
    return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;');
}

/**
 * Main function to convert JSON file to RDF file
 * @param inputPath Path to JSON input file
 * @param outputPath Path to RDF output file
 */
function convertJsonFileToRdf(inputPath: string, outputPath: string): void {
    try {
        // Read and parse JSON file
        const jsonStr = fs.readFileSync(inputPath, 'utf8');
        const jsonData = JSON.parse(jsonStr) as ZoteroData;

        // Convert to RDF
        const rdfStr = convertJsonToRdf(jsonData);

        // Write RDF to file
        fs.writeFileSync(outputPath, rdfStr, 'utf8');

        console.log(`Successfully converted ${inputPath} to ${outputPath}`);
    } catch (error) {
        console.error('Error converting JSON to RDF:', error);
    }
}

if (process.argv.length < 4) {
    console.log('Usage: tsx src/rdf_converter.mts <input-json-file> <output-rdf-file>');
    process.exit(1);
}

const inputPath = process.argv[2];
const outputPath = process.argv[3];

convertJsonFileToRdf(inputPath, outputPath);
