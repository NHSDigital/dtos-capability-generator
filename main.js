const axios = require('axios');
const fs = require('fs').promises;
const path = require('path');
const xml2js = require('xml2js');

const readline = require('readline');
const { constrainedMemory } = require('process');
const { table } = require('console');

const archLocation = '/Users/leegathercole/Documents/Archi/model-repository/dtos-architecture-blueprint'
const confluenceBaseUrl = 'https://nhsd-confluence.digital.nhs.uk';
const spaceKey = 'DTS';
let productsParentId = 944175321;
let capabilitiesParentId = 944175319;
let pagePrefix = "##";

const authToken = process.argv[2];

// Display help message if no token is provided or if `--help` is used
if (!authToken || authToken === '--help') {
    console.log(`
Usage: node main.js <PERSONAL_ACCESS_TOKEN>

Description:
  This script generates Confluence pages based on data from an Excel file.
  You need to provide a personal access token as a command-line argument.

Example:
  node main.js YOUR_PERSONAL_ACCESS_TOKEN
    `);
    process.exit(1); // Exit the script if no token or `--help` is provided
}


// Warning message with user confirmation
const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

rl.question(
    "Warning: Running this program will update all of the Business Capabilities and Product Pages in Confluence. Do you wish to continue? (yes/no): ",
    (answer) => {
        if (answer.toLowerCase() !== 'yes') {
            console.log("Operation canceled.");
            rl.close();
            process.exit(0);
        } else {
            console.log("Proceeding with the operation...");
            rl.close();
            // Call the main function to start the process
            main().catch(console.error);
        }
    }
);


async function main() {
    try {
        const data = await loadArchiModelFromFolder(archLocation);
        console.log("Transforming Archi model data...");
        const {valueStreamMap, productMap} = await transformArchiData(data);
        console.log("Creating value stream confluence pages");
        await createValueStreamPagesFromHierarchy(valueStreamMap)
        console.log("Creating product confluence pages");
        await createProductPagesFromHierarchy(productMap)
        console.log("done");
        
    } catch (error) {
        console.error('Error:', error.message);
    }
}

// Step 1: Load Templates
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
    console.debug('Capabilities L1: ')
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


async function createValueStreamPagesFromHierarchy(hierarchy, parentId = null) {
    const basePageId = capabilitiesParentId    
    console.log(hierarchy);
    for (const [key, value] of Object.entries(hierarchy)) {
        console.debug(`Key: ${key}`);
        console.debug(`Name: ${value.name}`);
        console.debug(`Description: ${value.description}`);
        console.debug('Capabilities:');
        let content = await renderStageContent(value);
        console.debug(`Page content: ${content}`);
        const pageId = await createOrUpdatePage(value.name, basePageId, content);
        for (const L0capability of value.capabilities) {
            console.debug(`  Capability ID: ${L0capability.id}`);
            console.debug('Capabilities L1: ')
            content = await renderL0Content(L0capability);
            const l0pageId = await createOrUpdatePage(L0capability.name, pageId, content);
            for (const L1capability of L0capability.children){
                content = await renderL1Content(L1capability);
                await createOrUpdatePage(L1capability.name, l0pageId, content);
            }
        
        }
      }
}

async function createProductPagesFromHierarchy(hierarchy, parentId = null) {
    const basePageId = productsParentId    
    for (const [key, value] of Object.entries(hierarchy)) {
        console.debug(`Key: ${key}`);
        console.debug(`Name: ${value.name}`);
        console.debug(`Description: ${value.description}`);
        console.debug('Products:');
        let content = await renderProductContent(value);
        console.debug(`Page content: ${content}`);
        const pageId = await createOrUpdatePage(value.name, basePageId, content);
    }
}

async function getPageByTitle(title) {
    console.debug(`Get href for page: ${title}`);
    const url = `${confluenceBaseUrl}/rest/api/content`;
    const headers = {
        'Authorization': `Bearer ${authToken}`,
        'Content-Type': 'application/json'
    };

    try {
        const response = await axios.get(url, {
            headers,
            params: {
                title: title,
                spaceKey: spaceKey,
                expand: 'version'
            }
        });
        return response.data.results[0] || null; // Return the first matching page, if any
    } catch (error) {
        console.error(`Error checking for page with title "${title}":`, error.response?.data || error.message);
        return null;
    }
}

// Function to create or update a Confluence page
async function createOrUpdatePage(title, parentId, content) {
    //Temp for testing
    title = pagePrefix + title;
    const existingPage = await getPageByTitle(title);
    if (existingPage) {
        console.log('Updating page - ' + title);
        const currentVersion = existingPage.version && existingPage.version.number ? existingPage.version.number : 1;
        // Update the page using PUT
        const url = `${confluenceBaseUrl}/rest/api/content/${existingPage.id}`;
        const body = {
            version: { number: currentVersion + 1 }, // Increment version
            title: title,
            type: 'page',
            ancestors: parentId ? [{ id: parentId }] : [],
            space: { key: spaceKey },
            body: {
              storage: {
                value: content,
                representation: 'storage'
              }
            }
        };
        try {
            const response = await axios.put(url, body, { headers: {
            'Authorization': `Bearer ${authToken}`,
            'Content-Type': 'application/json'
            }});
            return response.data.id;
        }
        catch (error) {
            console.error(`Failed to update page "${title}":`, error.response?.data || error.message);
        }
    } 
    else {
      // Create the page using POST
        console.log('Creating page - ' + title);
        const url = `${confluenceBaseUrl}/rest/api/content`;
        const body = {
            type: 'page',
            title: title,
            ancestors: parentId ? [{ id: parentId }] : [],
            space: { key: spaceKey },
            body: {
                storage: {
                value: content,
                representation: 'storage'
                }
            }
        };
        try {
            const response = await axios.post(url, body, { headers: {
            'Authorization': `Bearer ${authToken}`,
            'Content-Type': 'application/json'
            }});
            return response.data.id;
        } 
        catch (error) {
            console.error(`Failed to create page "${title}":`, error.response?.data || error.message);
        }
    }
}

async function loadArchiModelFromFolder(folderPath) {
    const xmlFiles = [];

    async function findXmlFiles(directory) {
        try {
            const files = await fs.readdir(directory, { withFileTypes: true });

            for (const file of files) {
                const fullPath = path.join(directory, file.name);

                if (file.isDirectory()) {
                    await findXmlFiles(fullPath); // Recursively process subfolders
                } else if (path.extname(file.name) === '.xml') {
                    xmlFiles.push(fullPath);
                }
            }
        } catch (error) {
            console.error(`Error reading directory ${directory}:`, error.message);
        }
    }

    await findXmlFiles(folderPath);

    // Parse and process each XML file
    const valueStreams = [];
    const relationships = [];  
    const products = [];
    const capabilities = [];
    const parser = new xml2js.Parser();

    for (const xmlFile of xmlFiles) {
        const xmlContent = await fs.readFile(xmlFile, 'utf8');
        const parsed = await parser.parseStringPromise(xmlContent);
        
        // Identify and classify XML types
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

function extractProperties(properties, field) {
    if (!properties) return ''; // No properties element
    if (Array.isArray(properties)) {
        // Loop through properties array to find "Outcome" key
        const extractProperty = properties.find((prop) => prop.$.key === field);
        return extractProperty ? extractProperty.$.value : '';
    }
    // Single properties element
    return properties.$.key === field ? properties.$.value : '';
}

// Transform data into a unified structure
async function transformArchiData(data) {
    const { products, capabilities, relationships, valueStreams } = data;

    // Transform Application Components
    const transformedProducts = products.map((component) => ({
        id: component.$.id,
        name: component.$.name,
        description: component.$.documentation || '',
    }));

    // Transform Capabilities
    const transformedCapabilities = await Promise.all(
        capabilities.map(async (capability) => {
            const page = await getPageByTitle(capability.$.name); // Await async call
            return {
                id: capability.$.id,
                name: capability.$.name,
                description: capability.$.documentation || '',
                input: extractProperties(capability.properties, 'Input'),
                output: extractProperties(capability.properties, 'Output'),
                href: page && page._links ? page._links.webui : null
            };
        })
    );
    // Transform Value Streams
    const transformedValuestreams = valueStreams.map((valueStream) => ({
        id: valueStream.$.id,
        name: valueStream.$.name,
        description: valueStream.$.documentation || '',
        outcome: extractProperties(valueStream.properties, 'Outcome'),
    }));


    // Transform Relationships
    const transformedRelationships = relationships.map((relationship) => ({
        id: relationship.$.id,
        source: {
            type: relationship.source[0].$["xsi:type"].split(":")[1],
            href: relationship.source[0].$.href,
        },
        target: {
            type: relationship.target[0].$["xsi:type"].split(":")[1],
            href: relationship.target[0].$.href,
        },
    }));
    return createHierarchy(transformedValuestreams, transformedCapabilities, transformedRelationships, transformedProducts);
}

function createHierarchy(valueStreams, capabilities, relationships, products) {
    const capabilityMap = {};
    const valueStreamMap = [];
    const productMap = {};

    valueStreams.forEach((valueStream) => {
        valueStreamMap[valueStream.id] = { ...valueStream, capabilities: [] };
    })

    // Initialize all capabilities in the map
    capabilities.forEach((capability) => {
        capabilityMap[capability.id] = { ...capability, children: [] };
    });

    products.forEach((product) => {
        productMap[product.id] = { ...product, capabilities: [] };
    });

    // Build parent-child relationships based on the transformedRelationships
    relationships.forEach((relationship) => {
        const { source, target } = relationship;
            
        if (source.type === "Capability" && target.type === "Capability") {
            const parent = capabilityMap[source.href.split('#')[1]]; // Extract ID from href
            const child = capabilityMap[target.href.split('#')[1]]; // Extract ID from href
            if (parent && child) {
                parent.children.push(child);
            }
        }
    });

    //Do it again, but this time for valustreams
    relationships.forEach((relationship) => {
        const { source, target } = relationship;
            
        if (source.type === "ValueStream" && target.type === "Capability") {
            const parent = valueStreamMap[source.href.split('#')[1]]; // Extract ID from href
            const child = capabilityMap[target.href.split('#')[1]]; // Extract ID from href
            if (parent && child) {
                parent.capabilities.push(child);
            }
        }
    });


    //Do it again, but this time for products
    relationships.forEach((relationship) => {
        const { source, target } = relationship;
            
        if (source.type === "ApplicationComponent" && target.type === "Capability") {
            const product = productMap[source.href.split('#')[1]];
            const capability = capabilityMap[target.href.split('#')[1]]; // Extract ID from href
            if (product && capability) {
                product.capabilities.push(capability);
            }
        }
    });

    return {valueStreamMap, productMap};
}