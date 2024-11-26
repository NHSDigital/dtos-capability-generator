# Introduction

This simple javascript library is used to pull data from the capability model and generate confluence pages directly. It does so by pulling data from an archi model and assumes therefore the model exists on your local machine. For reference on how to setup the archi model, refer to these guidelines https://nhsd-confluence.digital.nhs.uk/display/DTS/Archi+Set+Up+for+collaborative+work

This program is designed to run as a github action from the archi model to generate the two outputs below

- One view is from a Capability perspective and will update the pages under here - https://nhsd-confluence.digital.nhs.uk/display/DTS/Stages
- The other view is from a Product perspective and populates the contents under here - https://nhsd-confluence.digital.nhs.uk/display/DTS/Products

However it can be run locally if the archi file is present.

# Running the program

This is a simple javascript file and therefore should run with the latest version of node.

You will need to generate a personal access token for Confluence when running this program and it will need to be supplied at runtime. Instructions on creating a personal access token can be found here - https://confluence.atlassian.com/enterprise/using-personal-access-tokens-1026032365.html

By default it will run in test mode, pushing the output to this location on confluence - https://nhsd-confluence.digital.nhs.uk/display/DTS/Page-Generation-Playground

Assuming you are running this in a terminal console.

```git clone git@github.com:NHSDigital/dtos-capability-generator.git ```

```
npm install
node main.js <<YOUR_PASTOKEN>> <<LOCATION_TO_ARCHI>>
```

If you wish to run in production mode, then run it with the following parameters

```
node main.js <<YOUR_PASTOKEN>> <<LOCATION_TO_ARCHI>> --prod
```

BE WARNED THIS WILL OVERWRITE WHATEVER IS IN CONFLUENCE

