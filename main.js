const axios = require('axios');
const fs = require('fs').promises;
const path = require('path');
const xml2js = require('xml2js');
const readline = require('readline');

// Default Constants
let PAGE_PREFIX = "##";
let CAPABILITIES_PARENT_ID = 944175319; // Default parent ID for capabilities
let PRODUCTS_PARENT_ID = 944175321; // Default parent ID for products

const CONFLUENCE_BASE_URL = 'https://nhsd-confluence.digital.nhs.uk';
const SPACE_KEY = 'DTS';

// Parse Command-Line Arguments
const isProd = process.argv.includes('--prod'); // Check for the --prod flag
const AUTH_TOKEN = process.argv[2]; // Get the token from the second argument
const ARCHI_LOCATION = process.argv[3]; // Get the Archi location from the third argument

// Update Constants for Production
if (isProd) {
    PAGE_PREFIX = "PROD##";
    CAPABILITIES_PARENT_ID = 123456789; // Replace with your production parent ID for capabilities
    PRODUCTS_PARENT_ID = 987654321; // Replace with your production parent ID for products
}

// Display Help and Validate Inputs
if (!AUTH_TOKEN || !ARCHI_LOCATION || AUTH_TOKEN === '--help') {
    console.log(`
Usage: node main.js <PERSONAL_ACCESS_TOKEN> <ARCHI_LOCATION> [--prod]

Description:
  This script generates Confluence pages based on Archi XML data.
  You need to provide a personal access token and the path to the Archi model repository as arguments.

Options:
  --prod    Run the script in production mode, which uses production settings.

Example:
  node main.js YOUR_PERSONAL_ACCESS_TOKEN /path/to/archi/repository
  node main.js YOUR_PERSONAL_ACCESS_TOKEN /path/to/archi/repository --prod
    `);
    process.exit(1);
}

// Confirm Action
const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
rl.question(
    `Warning: Running this program will ${
        isProd ? "update production Business Capabilities and Product Pages" : "update test Business Capabilities and Product Pages"
    } in Confluence. Do you wish to continue? (yes/no): `,
    async (answer) => {
        rl.close();
        if (answer.toLowerCase() !== 'yes') {
            console.log("Operation canceled.");
            process.exit(0);
        }
        try {
            await main();
        } catch (error) {
            console.error('Error:', error.message);
        }
    }
);

// Main Function
async function main() {
    console.log(`Running in ${isProd ? "production" : "test"} mode...`);
    console.log(`Loading Archi model data from: ${ARCHI_LOCATION}`);
    const data = await loadArchiModelFromFolder(ARCHI_LOCATION);

    console.log("Transforming Archi model data...");
    const { valueStreamMap, productMap } = await transformArchiData(data);

    console.log("Creating Value Stream Confluence Pages...");
    await createValueStreamHierarchyPages(valueStreamMap, CAPABILITIES_PARENT_ID, renderStageContent, renderL0Content, renderL1Content);

    console.log("Creating Product Confluence Pages...");
    await createProductHierarchyPages(productMap, PRODUCTS_PARENT_ID, renderProductContent);

    console.log("Process completed.");
}

// Load Archi Model Data
async function loadArchiModelFromFolder(folderPath) {
    const xmlFiles = await findXmlFiles(folderPath);

    const valueStreams = [];
    const relationships = [];
    const products = [];
    const capabilities = [];
    const parser = new xml2js.Parser();

    for (const xmlFile of xmlFiles) {
        const xmlContent = await fs.readFile(xmlFile, 'utf8');
        const parsed = await parser.parseStringPromise(xmlContent);

        if (parsed['archimate:ApplicationComponent']) {
            products.push(parsed['archimate:ApplicationComponent']);
        } 
        else if (parsed['archimate:Capability']) {
            capabilities.push(parsed['archimate:Capability']);
        } 
        else if (parsed['archimate:AssociationRelationship']) {
            relationships.push(parsed['archimate:AssociationRelationship']);
        }
        else if (parsed['archimate:CompositionRelationship']){
            relationships.push(parsed['archimate:CompositionRelationship']);
        }
        else if (parsed['archimate:ValueStream']) {
            valueStreams.push(parsed['archimate:ValueStream']);
        }


    }

    return { products, capabilities, relationships, valueStreams };
}

async function findXmlFiles(directory) {
    const files = await fs.readdir(directory, { withFileTypes: true });
    const xmlFiles = [];

    for (const file of files) {
        const fullPath = path.join(directory, file.name);
        if (file.isDirectory()) {
            const nestedFiles = await findXmlFiles(fullPath);
            xmlFiles.push(...nestedFiles);
        } else if (path.extname(file.name) === '.xml') {
            xmlFiles.push(fullPath);
        }
    }

    return xmlFiles;
}

function extractProperties(properties, field) {
    if (!properties) return '';
    if (Array.isArray(properties)) {
        const property = properties.find((prop) => prop.$.key === field);
        return property ? property.$.value : '';
    }
    return properties.$.key === field ? properties.$.value : '';
}

// Transform Data
async function transformArchiData(data) {
    const { products, capabilities, relationships, valueStreams } = data;
    const transformedProducts = products.map((component) => ({
        id: component.$.id,
        name: component.$.name,
        description: component.$.documentation || '',
    }));

    const transformedCapabilities = await Promise.all(
        capabilities.map(async (capability) => {
            const page = await getPageByTitle(capability.$.name);
            return {
                id: capability.$.id,
                name: capability.$.name,
                description: capability.$.documentation || '',
                input: extractProperties(capability.properties, 'Input'),
                output: extractProperties(capability.properties, 'Output'),
                href: page && page._links ? page._links.webui : null,
            };
        })
    );

    const transformedValueStreams = valueStreams.map((valueStream) => ({
        id: valueStream.$.id,
        name: valueStream.$.name,
        description: valueStream.$.documentation || '',
        outcome: extractProperties(valueStream.properties, 'Outcome'),
    }));

    const transformedRelationships = relationships.map((relationship) => ({
        id: relationship.$.id,
        source: parseReference(relationship.source[0]),
        target: parseReference(relationship.target[0]),
    }));


    return createHierarchy(transformedValueStreams, transformedCapabilities, transformedRelationships, transformedProducts);
}

function parseReference(reference) {
    return {
        type: reference.$['xsi:type'].split(':')[1],
        href: reference.$.href.split('#')[1],
    };
}

function createHierarchy(valueStreams, capabilities, relationships, products) {
    const capabilityMap = createMap(capabilities);
    const valueStreamMap = createMap(valueStreams);
    const productMap = createMap(products);

    linkRelationships(relationships, capabilityMap, valueStreamMap, productMap);

    return { valueStreamMap, productMap };
}

function createMap(items) {
    return items.reduce((map, item) => {
        map[item.id] = { ...item, capabilities: [], children: [] };
        return map;
    }, {});
}

function linkRelationships(relationships, capabilityMap, valueStreamMap, productMap) {
    for (const rel of relationships) {
        const { source, target } = rel;
        if (source.type === 'Capability' && target.type === 'Capability') {
            const parent = capabilityMap[source.href];
            const child = capabilityMap[target.href];
            if (parent && child) parent.children.push(child);
        } else if (source.type === 'ValueStream' && target.type === 'Capability') {
            const valueStream = valueStreamMap[source.href];
            const capability = capabilityMap[target.href];
            if (valueStream && capability) valueStream.capabilities.push(capability);
        } else if (source.type === 'ApplicationComponent' && target.type === 'Capability') {
            const product = productMap[source.href];
            const capability = capabilityMap[target.href];
            if (product && capability) product.capabilities.push(capability);
        }
    }
}

// Render Pages

async function loadTemplate(filename) {
    try {
        return await fs.readFile(filename, 'utf8');
    } catch (error) {
        console.error(`Error loading template "${filename}":`, error.message);
    }
}

// Step 3: Rendering Functions
function renderTemplate(template, variables) {
    const render = template.replace(/\${(.*?)}/g, (_, key) => variables[key.trim()] || '');
    return render;
}


async function renderStageContent(stage) {
    const template = await loadTemplate('templates/stageTemplate.md');
    return renderTemplate(template, {
        stageName: stage.name,
        stageDescription: stage.description,
        stageOutcome: stage.outcome,
    });
}

async function renderL0Content(data) {
    const template = await loadTemplate('templates/l0Template.md');
    return renderTemplate(template, {
        description: data.description,
        input: data.input,
        output: data.output,
    });
}

async function renderL1Content(data) {
    const template = await loadTemplate('templates/l1Template.md');
    return renderTemplate(template, {
        name: data.name,
        description: data.description
    });
}

async function renderProductContent(product) {
    const template = await loadTemplate('templates/productTemplate.md');
    let tableRows = "";    
    
    for (const L1capability of product.capabilities) {
        tableRows = tableRows + `<tr><td><a href='${L1capability.href}'>${L1capability.name}</a></td></tr>`    
    }
    
    return renderTemplate(template, {
        description: product.description,
        tableRows,
        productUsers: product.productUsers,
        domain: product.productDomain,
        rootEntity: product.productRootEntity
    });
}

// Create Pages
async function createValueStreamHierarchyPages(hierarchy, parentId, renderStage, renderL0, renderL1) {
    for (const [key, item] of Object.entries(hierarchy)) {
        const stageContent = await renderStage(item);
        const pageId = await createOrUpdatePage(item.name, parentId, stageContent);

        for (const capability of item.capabilities || []) {
            const l0Content = await renderL0(capability);
            const l0PageId = await createOrUpdatePage(capability.name, pageId, l0Content);

            for (const child of capability.children || []) {
                const l1Content = await renderL1(child);
                await createOrUpdatePage(child.name, l0PageId, l1Content);
            }
        }
    }
}

async function createProductHierarchyPages(hierarchy, parentId, renderProduct) {
    for (const [key, item] of Object.entries(hierarchy)) {
        const stageContent = await renderProduct(item);
        const pageId = await createOrUpdatePage(item.name, parentId, stageContent);
    }
}

// Confluence API Functions
async function getPageByTitle(title) {
    const url = `${CONFLUENCE_BASE_URL}/rest/api/content`;
    const headers = { Authorization: `Bearer ${AUTH_TOKEN}`, 'Content-Type': 'application/json' };

    try {
        const response = await axios.get(url, {
            headers,
            params: {
                title,
                spaceKey: SPACE_KEY,
                expand: 'version',
            },
        });
        return response.data.results[0] || null; // Return the first matching page, if any
    } catch (error) {
        console.error(`Error checking for page with title "${title}":`, error.message);
        return null;
    }
}

async function createOrUpdatePage(title, parentId, content) {
    const pageTitle = `${PAGE_PREFIX}${title}`;
    const existingPage = await getPageByTitle(pageTitle);

    const url = existingPage
        ? `${CONFLUENCE_BASE_URL}/rest/api/content/${existingPage.id}`
        : `${CONFLUENCE_BASE_URL}/rest/api/content`;

    const body = {
        type: 'page',
        title: pageTitle,
        ancestors: parentId ? [{ id: parentId }] : [],
        space: { key: SPACE_KEY },
        body: {
            storage: {
                value: content,
                representation: 'storage',
            },
        },
    };

    if (existingPage) {
        body.version = { number: existingPage.version.number + 1 }; // Increment version for updates
    }

    try {
        const response = existingPage
            ? await axios.put(url, body, { headers: { Authorization: `Bearer ${AUTH_TOKEN}`, 'Content-Type': 'application/json' } })
            : await axios.post(url, body, { headers: { Authorization: `Bearer ${AUTH_TOKEN}`, 'Content-Type': 'application/json' } });

        console.log(`${existingPage ? 'Updated' : 'Created'} page: ${pageTitle}`);
        return response.data.id;
    } catch (error) {
        console.error(`Error ${existingPage ? 'updating' : 'creating'} page "${pageTitle}":`, error.message);
    }
}