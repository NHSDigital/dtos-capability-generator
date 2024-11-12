const axios = require('axios');
const fs = require('fs').promises;
const ExcelJS = require('exceljs');
const readline = require('readline');

const filePath = 'data/BusinessCapabilitiesv0.1.xlsx';
const confluenceBaseUrl = 'https://nhsd-confluence.digital.nhs.uk';
const spaceKey = 'DTS';

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
        console.log("Loading data from spreadsheet");
        const data = await loadExcelData();
        console.log("Generating value stream data set");
        const valueStreamData = transformToValueStreamView(data);
        console.log("Creating value stream confluence pages");
        await createValueStreamHierarchy(valueStreamData)
        console.log("Generating product data set");
        const productData = transformToProductView(data);
        console.log("Creating product confluence pages");
        await createProductHierarchy(productData)
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

// Step 2: Load and Process Data
async function loadExcelData() {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(filePath);
    const worksheet = workbook.getWorksheet("Capability Map Flattened");

    const data = [];
    worksheet.eachRow((row, rowNumber) => {
        if (rowNumber === 1) return;

        const [
            valueStreamStage = '',
            stageDescription = '',
            stageOutcome = '',
            l0Capability = '',
            l0Description = '',
            l0Input = '',
            l0Output = '',
            l1CapabilityAndDescription = '',
            product = '',
            productDescription = '',
            productUsers = ''
        ] = row.values.slice(1).map(getPlainText);

        let [l1Name, l1Description] = parseL1Capability(l1CapabilityAndDescription);
        data.push({
            valueStreamStage, stageDescription, stageOutcome,
            l0Capability, l0Description, l0Input, l0Output,
            l1Name, l1Description, product, productDescription, productUsers
        });
    });
    return data;
}

function parseL1Capability(l1CapabilityAndDescription) {
    if (l1CapabilityAndDescription && l1CapabilityAndDescription.includes(':')) {
        return l1CapabilityAndDescription.split(/:(.*)/).map(s => s.trim());
    }
    return [l1CapabilityAndDescription, ''];
}

function transformToValueStreamView(data) {
    const valueStreamData = {};
    data.forEach(item => {
        if (!valueStreamData[item.valueStreamStage]) {
            valueStreamData[item.valueStreamStage] = {
                stageDescription: item.stageDescription,
                stageOutcome: item.stageOutcome,
                l0Capabilities: {}
            };
        }
        const stage = valueStreamData[item.valueStreamStage];
        if (!stage.l0Capabilities[item.l0Capability]) {
            stage.l0Capabilities[item.l0Capability] = {
                description: item.l0Description,
                input: item.l0Input,
                output: item.l0Output,
                l1Capabilities: []
            };
        }
        stage.l0Capabilities[item.l0Capability].l1Capabilities.push({
            name: item.l1Name,
            description: item.l1Description,
            product: item.product
        });
    });
    return valueStreamData;
}

function transformToProductView(data) {
    const productData = {};
    data.forEach(async item => {
        if (!productData[item.product]) {
            productData[item.product] = { l1Capabilities: [] };
            productData[item.product].description = item.productDescription.result;
            let productUsers = String(item.productUsers.result)
            productUsers = productUsers.split(',').map(item => item.trim()).map(item => `<li>${item}</li>`).join('');
            productData[item.product].productUsers = `<ul>${productUsers}</ul>`;
        }
        let l1link = await getPageByTitle(item.l1Name);
        if (l1link != null) l1link = l1link._links.webui; 
        let l0link = await getPageByTitle(item.l0Capability);
        if (l0link != null) l0link = l0link._links.webui;
        productData[item.product].l1Capabilities.push({
            name: item.l1Name,
            l1link: l1link,
            valueStreamStage: item.valueStreamStage,
            l0Capability: item.l0Capability,
            l0link: l0link
        });
    });
    return productData;
}

// Step 3: Rendering Functions
function renderTemplate(template, variables) {
    const render = template.replace(/\${(.*?)}/g, (_, key) => variables[key.trim()] || '');
    return render;
}

async function renderStageContent(stage) {
    const template = await loadTemplate('templates/stageTemplate.md');
    return renderTemplate(template, {
        stageName: stage.valueStreamStage,
        stageDescription: stage.stageDescription,
        stageOutcome: stage.stageOutcome,
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
    const tableRows = product.l1Capabilities
        .map(cap => `<tr><td><a href='${cap.l1link}'>${cap.name}</a></td><td><a href='${cap.l0link}'>${cap.l0Capability}</a></td></tr>`)
        .join('');    
    
    return renderTemplate(template, {
        description: product.description,
        tableRows,
        productUsers: product.productUsers
    });
}

// Step 4: Confluence API Integration
async function createValueStreamHierarchy(data) {
    const basePageId = 937823228
    for (const [key, item] of Object.entries(data)) {
        let content = await renderStageContent(item);
        const pageId = await createOrUpdatePage(key, basePageId, content);

        if (pageId && item.l0Capabilities) {
            for (const [capability, details] of Object.entries(item.l0Capabilities)) {
                content = await renderL0Content(details);
                const l0pageId = await createOrUpdatePage(capability, pageId, content);

                if (details.l1Capabilities) {
                    for (const l1Cap of details.l1Capabilities) {
                        content = await renderL1Content(l1Cap);
                        await createOrUpdatePage(l1Cap.name, l0pageId, content);
                    }
                }
            }
        }
    }
}


async function createProductHierarchy(data) {
    const basePageId = 937823239
    for (const [key, item] of Object.entries(data)) {
        let content = await renderProductContent(item);
        const pageId = await createOrUpdatePage(key, basePageId, content);
    }
}




// Confluence API functions and helpers remain the same...

function getPlainText(cell) {
    if (cell && typeof cell === 'object' && cell.richText) {
        return cell.richText.map(segment => segment.text).join('');
    }
    return cell;
}

async function getPageByTitle(title) {
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
