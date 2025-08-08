# Asset Taxonomy Remapper for Kontent.ai

This Node.js script remaps taxonomy terms on assets from a Kontent.ai source environment to a target environment. It dynamically fetches asset and taxonomy data, generates an HTML preview report, and updates the target assets after user confirmation.

**Note:** This script is intended to be used **in conjunction with** the [Data-ops tool](https://github.com/kontent-ai/data-ops) when backing up and restoring a Kontent.ai environment. It addresses the [Data-ops Asset Type limitation](https://github.com/kontent-ai/data-ops/blob/main/src/commands/environment/backupRestore/README.md#known-limitations) by directly updating asset taxonomy elements using the Management API.

> ⚠️ This is not an officially supported solution. It is a community-driven workaround maintained by the Consulting team on a best-effort basis. Feel free to adapt or contribute as needed.

---

## Features

- Fetches assets and taxonomies dynamically via the Kontent.ai Management API.
- Maps taxonomy terms by codename from source to target environments.
- Generates an HTML report previewing taxonomy updates with clickable asset links.
- Prompts user with a confirmation before applying updates to target assets.

---

## Prerequisites

- **Node.js** version 18 or later (required for native `fetch` and top-level `await`).
- Kontent.ai Management API keys with appropriate permissions for both source and target environments.
- Internet access to reach the Kontent.ai Management API.
- `.env` file in the root folder with the following variables:

  ```env
  SOURCE_ENV_ID=your-source-environment-id
  SOURCE_MAPI_KEY=your-source-management-api-key
  TARGET_ENV_ID=your-target-environment-id
  TARGET_MAPI_KEY=your-target-management-api-key
  ```

---

## Installation & Usage

1. Clone or download this repository.

2. Run `npm install` to install required dependencies.

3. Rename `.env.template` file to `.env` in the project root and add your environment IDs and Management API keys.

4. Manually add the Taxonomy Group to the Asset Type in the Target Environment.

5. Run the script:

```bash
node update-assets.js
```

---

## Report Preview

![Asset Taxonomy Remap Report](./assets/Asset-Taxonomy%20Remap-Report.png)

## Script Behavior

- Fetches assets and taxonomies from source and target environments.
- Generates an HTML report in a `Results` folder and opens it automatically in your default browser.
- Allows you to review taxonomy mappings and pending changes.
- Prompts in the terminal whether to proceed with updating the assets (`y` or `n`).
- Updates target assets accordingly if confirmed, reporting success or failure per asset.

---

## Notes

- The script addresses the Data-ops Asset Type limitation for taxonomy remapping.
- The HTML report includes direct links to assets and environments for easy inspection.
- Ensure your Management API keys have permissions to read and update assets and taxonomies.
- If you decline the update prompt, no changes will be made.

---

## Troubleshooting

- Ensure your `.env` file is correctly formatted and placed in the project root.
- Confirm network access to Kontent.ai Management API.
- Check API key permissions and expiration.
- Make sure you’re using Node.js v18 or later.

---

## Known Limitations

- Currently only supports the remapping of one taxonomy group in the Asset Type.

---

## Contributing

This tool is maintained by the Consulting team on a best-effort basis and is not an officially supported solution.

We welcome suggestions, improvements, and fixes! To contribute:

1. **Fork** the repository.
2. **Create a new branch** for your changes.
3. Make your edits and ensure they are well-documented.
4. **Test** your changes if applicable.
5. **Submit a pull request** with a clear description of what you’ve changed and why.

Feel free to open an issue if you have questions or ideas before starting a contribution.

---

## License

This project is licensed under the MIT License. See the ./LICENSE file for details.
