# Introduction

This simple javascript library is used to pull data from the capability model and generate confluence pages directly. It does so by pulling data from an excel spreadsheet and generating two views of that underlying data. 

- One view is from a Capability perspective and will update the pages under here - https://nhsd-confluence.digital.nhs.uk/display/DTS/Stages
- The other view is from a Product perspective and populates the contents under here - https://nhsd-confluence.digital.nhs.uk/display/DTS/Products

The data that is currently being processed is in the /data folder. In the future this will either come from sharepoint directly or an architecture modelling application

Depending on what it finds it will either update the content or create a new page. It is important to note that anything that has been added manually to these pages will be overwritten if this file is executed.

# Running the program

This is a simple javascript file and therefore should run with the latest version of node.

You will need to generate a personal access token for Confluence when running this program and it will need to be supplied at runtime. Instructions on creating a personal access token can be found here - https://confluence.atlassian.com/enterprise/using-personal-access-tokens-1026032365.html

Assuming you are running this in a terminal console.

```git clone git@github.com:NHSDigital/dtos-capability-generator.git ```

```
npm install
node main.js <<YOUR_PASTOKEN>>
```

