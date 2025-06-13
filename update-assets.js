import fs from 'fs/promises';
import path from 'path';
import open from 'open';
import readline from 'readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import dotenv from 'dotenv';
dotenv.config(); // Load environment variables from .env file

// Report template HTML file path
const htmlTemplatePath = path.join(
  process.cwd(),
  'templates',
  'report-template.html'
);

// IDs of the taxonomy elements to remap from (old) and to (new)
let OLD_ELEMENT_ID;
let NEW_ELEMENT_ID;

// Destructure required environment variables for source and target environments
const { SOURCE_ENV_ID, SOURCE_MAPI_KEY, TARGET_ENV_ID, TARGET_MAPI_KEY } =
  process.env;

// Check required environment variables are set, else exit with error
if (!SOURCE_ENV_ID || !SOURCE_MAPI_KEY || !TARGET_ENV_ID || !TARGET_MAPI_KEY) {
  console.error(
    'Please set SOURCE_ENV_ID, SOURCE_MAPI_KEY, TARGET_ENV_ID and TARGET_MAPI_KEY in your .env file'
  );
  process.exit(1);
}

// Fetch JSON data from Kontent Management API with authorization header
async function fetchKontent(url, apiKey) {
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
  });
  if (!res.ok) {
    const errorBody = await res.text();
    throw new Error(
      `Failed to fetch ${url}: ${res.status} ${res.statusText}\n${errorBody}`
    );
  }
  return res.json();
}

// Fetch all assets from given environment
async function fetchAllAssets(envId, apiKey) {
  const url = `https://manage.kontent.ai/v2/projects/${envId}/assets?depth=all`;
  const json = await fetchKontent(url, apiKey);
  // Return array of assets with elements
  return json.assets || [];
}

// Fetch all taxonomies from given environment
async function fetchAllTaxonomies(envId, apiKey) {
  const url = `https://manage.kontent.ai/v2/projects/${envId}/taxonomies`;
  const json = await fetchKontent(url, apiKey);
  return json.taxonomies || [];
}

// Flatten nested taxonomy terms into a single array for easy lookup
function flattenTerms(taxonomyGroups) {
  const result = [];
  function recurse(terms) {
    for (const term of terms) {
      result.push(term);
      if (term.terms?.length) recurse(term.terms);
    }
  }
  taxonomyGroups.forEach((group) => recurse(group.terms || []));
  return result;
}

// Predefined pill colors used for displaying taxonomy term pills in the HTML report
const pillColors = [
  'bg-red-100 text-red-800',
  'bg-green-100 text-green-800',
  'bg-blue-100 text-blue-800',
  'bg-yellow-100 text-yellow-800',
  'bg-purple-100 text-purple-800',
  'bg-pink-100 text-pink-800',
  'bg-indigo-100 text-indigo-800',
  'bg-teal-100 text-teal-800',
  'bg-orange-100 text-orange-800',
  'bg-lime-100 text-lime-800',
  'bg-amber-100 text-amber-800',
  'bg-emerald-100 text-emerald-800',
  'bg-cyan-100 text-cyan-800',
  'bg-violet-100 text-violet-800',
  'bg-rose-100 text-rose-800',
  'bg-sky-100 text-sky-800',
  'bg-fuchsia-100 text-fuchsia-800',
  'bg-stone-100 text-stone-800',
  'bg-gray-100 text-gray-800',
  'bg-zinc-100 text-zinc-800',
];

// Get a pill color class based on an index to cycle through colors
function getPillColor(index) {
  return pillColors[index % pillColors.length];
}

// Generate HTML spans styled as colored pills for taxonomy terms
function generateTaxonomyPills(taxonomies, allTerms) {
  return taxonomies
    .map((termId) => {
      const term = allTerms.find((t) => t.id === termId);
      if (!term) return '';
      // Generate consistent color based on term codename hash
      const colorIndex = [...term.codename].reduce(
        (acc, c) => acc + c.charCodeAt(0),
        0
      );
      const pillClass = pillColors[colorIndex % pillColors.length];
      return `<span class="inline-block px-3 py-1 rounded-full text-xs font-semibold mr-2 mb-1 ${pillClass}">${term.name}</span>`;
    })
    .join('');
}

// Extracts the first available asset element ID from a Kontent.ai asset object.
// This is used to dynamically determine the taxonomy element ID for asset updates.
function getElementIdFromAsset(asset) {
  const element = asset.elements.find((e) => e?.element?.id);
  return element?.element?.id || null;
}

// Generate an HTML table cell for an asset showing an image and link to the asset URL
function generateAssetCell(asset, envId, allTerms) {
  if (!asset) return '';
  const assetUrl = asset.url || '#';
  const assetCodename = asset.codename || 'unknown';
  // Link points directly to asset URL, opens in new tab
  return `
    <a href="${assetUrl}" target="_blank" rel="noopener noreferrer" class="flex items-center">
      <img src="${assetUrl}" alt="${assetCodename}" class="h-[50px] w-auto rounded mr-2" />
      <span class="underline text-blue-600 hover:text-blue-800">${assetCodename}</span>
    </a>
  `;
}

// Perform a PUT request to update an asset in the target environment with the given body
async function updateAsset(envId, apiKey, assetId, body) {
  const url = `https://manage.kontent.ai/v2/projects/${envId}/assets/${assetId}`;
  const res = await fetch(url, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errorBody = await res.text();
    throw new Error(
      `Failed to update asset ${assetId}: ${res.status} ${res.statusText}\n${errorBody}`
    );
  }

  return await res.json();
}

// Main async function to run the whole update and reporting process
async function main() {
  console.log('Fetching assets and taxonomies from source environment...');
  const assetsSource = await fetchAllAssets(SOURCE_ENV_ID, SOURCE_MAPI_KEY);
  const taxonomySourceRaw = await fetchAllTaxonomies(
    SOURCE_ENV_ID,
    SOURCE_MAPI_KEY
  );

  console.log('Fetching assets and taxonomies from target environment...');
  const assetsTarget = await fetchAllAssets(TARGET_ENV_ID, TARGET_MAPI_KEY);
  const taxonomyTargetRaw = await fetchAllTaxonomies(
    TARGET_ENV_ID,
    TARGET_MAPI_KEY
  );

  // Extract the taxonomy element ID from the first source and target asset.
  // This avoids hardcoding element IDs and ensures the script adapts to each environment.
  const sampleSourceAsset = assetsSource[0];
  const sampleTargetAsset = assetsTarget[0];

  OLD_ELEMENT_ID = getElementIdFromAsset(sampleSourceAsset);
  NEW_ELEMENT_ID = getElementIdFromAsset(sampleTargetAsset);

  if (!OLD_ELEMENT_ID || !NEW_ELEMENT_ID) {
    console.error(
      '❌ Could not extract element IDs from the first asset in each environment.'
    );
    process.exit(1);
  }

  // Flatten taxonomy terms for easier lookup
  const sourceTerms = flattenTerms(taxonomySourceRaw);
  const targetTerms = flattenTerms(taxonomyTargetRaw);

  // Create map from source term IDs to target term IDs by matching codename
  const termIdMap = new Map();
  for (const sTerm of sourceTerms) {
    const tTerm = targetTerms.find((t) => t.codename === sTerm.codename);
    if (tTerm) termIdMap.set(sTerm.id, tTerm.id);
  }

  // Prepare an array to hold data needed for HTML report and updates
  const reportRows = [];

  // Loop through each source asset
  for (const sourceAsset of assetsSource) {
    // Find corresponding asset in target environment by codename
    const targetAsset = assetsTarget.find(
      (a) => a.codename === sourceAsset.codename
    );
    if (!targetAsset) {
      console.warn(
        `No target asset matching source codename "${sourceAsset.codename}", skipping.`
      );
      continue;
    }

    // Find old taxonomy element value in source asset
    const oldElement = sourceAsset.elements.find(
      (e) => e.element.id === OLD_ELEMENT_ID
    ) || {
      element: { id: OLD_ELEMENT_ID },
      value: [],
    };

    // Skip if old element has no taxonomy values
    if (!oldElement.value || oldElement.value.length === 0) {
      continue;
    }

    // Map old taxonomy term IDs to new target term IDs
    const newValues = (oldElement.value || [])
      .map((v) => {
        if (!v.id) return null;
        const newId = termIdMap.get(v.id);
        if (!newId) {
          console.warn(
            `❌ Could not remap term with ID "${v.id}" for asset "${sourceAsset.codename}", skipping this term.`
          );
          return null;
        }
        return { id: newId };
      })
      .filter(Boolean);

    // Prepare new element with updated taxonomy term IDs
    const newElement = {
      element: { id: NEW_ELEMENT_ID },
      value: newValues,
    };

    // Find existing old element in target asset to show current taxonomies (for reporting)
    const existingTargetOldElement = targetAsset.elements.find(
      (el) => el.element.id === OLD_ELEMENT_ID
    ) || {
      element: { id: OLD_ELEMENT_ID },
      value: [],
    };
    const existingTargetOldTaxonomies = existingTargetOldElement.value || [];

    // Build updated asset payload with new taxonomy element
    const updatedAssetPayload = {
      ...targetAsset,
      elements: targetAsset.elements.map((el) =>
        el.element.id === NEW_ELEMENT_ID ? newElement : el
      ),
    };

    // Collect taxonomy names from source and target for displaying in the report
    const sourceTaxonomyNames = oldElement.value
      .map((v) => {
        const term = sourceTerms.find((t) => t.id === v.id);
        return term ? term.name : null;
      })
      .filter(Boolean);

    const targetTaxonomyNamesPending = newValues
      .map((v) => {
        const term = targetTerms.find((t) => t.id === v.id);
        return term ? term.name : null;
      })
      .filter(Boolean);

    const existingTargetTaxonomyNames = existingTargetOldTaxonomies
      .map((v) => {
        const term = targetTerms.find((t) => t.id === v.id);
        return term ? term.name : null;
      })
      .filter(Boolean);

    // Add a row of info for report and potential update
    reportRows.push({
      sourceAsset,
      targetAsset,
      sourceTaxonomyNames,
      existingTargetTaxonomyNames,
      targetTaxonomyNamesPending,
      updatedAssetPayload,
    });
  }

  // Generate HTML report of changes

  const resultsFolder = path.resolve(process.cwd(), 'Results');
  await fs.mkdir(resultsFolder, { recursive: true }); // Ensure results folder exists
  const htmlPath = path.join(
    resultsFolder,
    'asset-taxonomy-update-report.html'
  );

  // Build links to source and target environments in Kontent.ai app
  const sourceEnvLink = `https://app.kontent.ai/${SOURCE_ENV_ID}/mission-control/your-work`;
  const targetEnvLink = `https://app.kontent.ai/${TARGET_ENV_ID}/mission-control/your-work`;

  // Helper function to generate colored pills for taxonomy names in report
  function generateTaxPillsHtml(names, allTerms) {
    // Assign consistent color per taxonomy name pill
    return names
      .map((name, i) => {
        const colorClass = pillColors[i % pillColors.length];
        return `<span class="inline-block px-3 py-1 rounded-full text-xs font-semibold mr-2 mb-1 ${colorClass}">${name}</span>`;
      })
      .join('');
  }

  // Build full HTML report string with Tailwind CSS styles
  const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Asset Taxonomy Update Report</title>
  <link rel="icon" href="https://kontent.ai/favicon_v2.ico" />
  <script src="https://cdn.tailwindcss.com"></script>
</head>
<body class="bg-gray-50 p-8">
  <h1 class="text-2xl font-bold mb-6">Asset Taxonomy Update Report</h1>

  <table class="mb-8 w-full border-collapse border border-gray-300">
    <thead>
      <tr class="bg-gray-200">
        <th class="border border-gray-300 p-2 text-left">Source Environment ID</th>
        <th class="border border-gray-300 p-2 text-left">Target Environment ID</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td class="border border-gray-300 p-2">
          <a href="${sourceEnvLink}" target="_blank" class="text-blue-600 underline hover:text-blue-800">${SOURCE_ENV_ID}</a>
        </td>
        <td class="border border-gray-300 p-2">
          <a href="${targetEnvLink}" target="_blank" class="text-blue-600 underline hover:text-blue-800">${TARGET_ENV_ID}</a>
        </td>
      </tr>
    </tbody>
  </table>

  <table class="w-full border-collapse border border-gray-300">
    <thead>
      <tr class="bg-gray-200">
        <th class="border border-gray-300 p-2 text-left">Source Asset</th>
        <th class="border border-gray-300 p-2 text-left">Source Asset Taxonomies</th>
        <th class="border border-gray-300 p-2 text-left">Target Asset</th>
        <th class="border border-gray-300 p-2 text-left">Target Asset Taxonomies (Existing)</th>
        <th class="border border-gray-300 p-2 text-left">Target Asset Taxonomies (Pending Update)</th>
      </tr>
    </thead>
    <tbody>
      ${reportRows
        .map(
          ({
            sourceAsset,
            targetAsset,
            sourceTaxonomyNames,
            existingTargetTaxonomyNames,
            targetTaxonomyNamesPending,
          }) => {
            // NEW: extract existing terms from NEW_ELEMENT_ID in target asset
            const existingNewElement = targetAsset.elements.find(
              (el) => el.element.id === NEW_ELEMENT_ID
            ) || { value: [] };
            const existingNewTaxonomyNames = (existingNewElement.value || [])
              .map((v) => {
                const term = targetTerms.find((t) => t.id === v.id);
                return term ? term.name : null;
              })
              .filter(Boolean);

            return `<tr class="hover:bg-gray-100">
              <td class="border border-gray-300 p-2 align-middle">${generateAssetCell(
                sourceAsset,
                SOURCE_ENV_ID,
                sourceTerms
              )}</td>
              <td class="border border-gray-300 p-2 align-middle">${generateTaxPillsHtml(
                sourceTaxonomyNames,
                sourceTerms
              )}</td>
              <td class="border border-gray-300 p-2 align-middle">${generateAssetCell(
                targetAsset,
                TARGET_ENV_ID,
                targetTerms
              )}</td>
              <td class="border border-gray-300 p-2 align-middle">${generateTaxPillsHtml(
                existingNewTaxonomyNames,
                targetTerms
              )}</td>
              <td class="border border-gray-300 p-2 align-middle">${generateTaxPillsHtml(
                targetTaxonomyNamesPending,
                targetTerms
              )}</td>
            </tr>`;
          }
        )
        .join('')}
    </tbody>
  </table>
</body>
</html>
`;

  await fs.writeFile(htmlPath, html, 'utf-8'); // Write the report to disk
  console.log(`\nHTML report generated: ${htmlPath}`);
  await open(htmlPath); // Open the report in default browser

  // Prompt user to confirm if they want to proceed with updating assets
  const rl = readline.createInterface({ input, output });
  const answer = await rl.question(
    'Please review the HTML report in your browser. Do you want to proceed with updating the assets? (y/n): '
  );
  rl.close();

  if (answer.toLowerCase() !== 'y') {
    console.log('Aborted by user. No assets were updated.');
    process.exit(0);
  }

  // Proceed with updating assets after user confirmation
  for (const row of reportRows) {
    const { targetAsset, updatedAssetPayload, sourceAsset } = row;
    try {
      await updateAsset(
        TARGET_ENV_ID,
        TARGET_MAPI_KEY,
        targetAsset.id,
        updatedAssetPayload
      );
      console.log(`✅ Successfully updated asset "${sourceAsset.codename}"`);
    } catch (err) {
      console.error(
        `❌ Failed to update asset "${sourceAsset.codename}":`,
        err.message
      );
    }
  }
}

// Execute main function, catch and log fatal errors
main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
