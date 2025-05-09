# Introduction

[![CI/CD Pull Request](https://github.com/nhs-england-tools/repository-template/actions/workflows/cicd-1-pull-request.yaml/badge.svg)](https://github.com/nhs-england-tools/repository-template/actions/workflows/cicd-1-pull-request.yaml)
[![Quality Gate Status](https://sonarcloud.io/api/project_badges/measure?project=repository-template&metric=alert_status)](https://sonarcloud.io/summary/new_code?id=repository-template)

This simple javascript library is used to pull data from the capability model and generate confluence pages directly. It does so by pulling data from an ArchiMate model and assumes therefore the model exists on your local machine. For reference on how to setup the ArchiMate model, refer to these [guidelines](https://nhsd-confluence.digital.nhs.uk/display/DTS/Archi+Set+Up+for+collaborative+work)

This program is designed to run as a GitHub action from the ArchiMate model to generate the two outputs below

- One view is from a Capability perspective and will update the pages under [here](https://nhsd-confluence.digital.nhs.uk/display/DTS/Stages)
- The other view is from a Product perspective and populates the contents under [here](https://nhsd-confluence.digital.nhs.uk/display/DTS/Products)

However it can be run locally if the ArchiMate file is present.

## Table of Contents

- [Introduction](#introduction)
  - [Table of Contents](#table-of-contents)
  - [Setup](#setup)
    - [Page Deletion](#page-deletion)
    - [Prerequisites](#prerequisites)
  - [Licence](#licence)

## Setup

This is a simple javascript file and therefore should run with the latest version of node.

You will need to generate a personal access token for Confluence when running this program and it will need to be supplied at runtime. Instructions on creating a personal access token can be found here - <https://confluence.atlassian.com/enterprise/using-personal-access-tokens-1026032365.html>

By default it will run in test mode, pushing the output to this location on confluence - <https://nhsd-confluence.digital.nhs.uk/display/DTS/Page-Generation-Playground>

Assuming you are running this in a terminal console.

```git clone git@github.com:NHSDigital/dtos-capability-generator.git```

Change into the locally cloned directory.

```cd dtos-capability-generator```

Clone the repository containing C4 model diagram images.

```git clone https://github.com/NHSDigital/dtos-solution-architecture.git```

Install node modules.

```npm install```

Update Confluence SANDPIT pages (using content from Archi and C4 model diagram images)

```node main.js <<YOUR_PASTOKEN>> <<LOCATION_TO_ARCHI>>```

Update Confluence PRODUCTION pages (using content from Archi and C4 model diagram images)

```node main.js <<YOUR_PASTOKEN>> <<LOCATION_TO_ARCHI>> --prod```

### Page Deletion

It became clear that continually updating the pages resulted in issues around cleanup and specifically around unpublished changes. The program now deletes all of the sub pages under both capabilities and products.

But it will prompt you if you want to delete and it outputs the pages due to be deleted.

As someone that didn't do this.....PLEASE CHECK THE FILES TO BE DELETED

### Prerequisites

The following software packages, or their equivalents, are expected to be installed and configured:

- [node](https://www.docker.com/) container runtime or a compatible tool, e.g. [Podman](https://podman.io/),

## Licence

> The [LICENCE.md](./LICENCE.md) file will need to be updated with the correct year and owner

Any HTML or Markdown documentation is [© Crown Copyright](https://www.nationalarchives.gov.uk/information-management/re-using-public-sector-information/uk-government-licensing-framework/crown-copyright/) and available under the terms of the [Open Government Licence v3.0](https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/).
