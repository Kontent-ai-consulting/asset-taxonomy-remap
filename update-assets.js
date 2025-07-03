// Updated script with support for multiple taxonomy groups per asset

import fs from 'fs/promises';
import path from 'path';
import open from 'open';
import readline from 'readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import dotenv from 'dotenv';
dotenv.config();

const htmlTemplatePath = path.join(
  process.cwd(),
  'templates',
  'report-template.html'
);

const { SOURCE_ENV_ID, SOURCE_MAPI_KEY, TARGET_ENV_ID, TARGET_MAPI_KEY } =
  process.env;

if (!SOURCE_ENV_ID || !SOURCE_MAPI_KEY || !TARGET_ENV_ID || !TARGET_MAPI_KEY) {
  console.error(
    'Please set SOURCE_ENV_ID, SOURCE_MAPI_KEY, TARGET_ENV_ID and TARGET_MAPI_KEY in your .env file'
  );
  process.exit(1);
}

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

function generateTaxPillsHtml(names) {
  return names
    .map((name, i) => {
      const colorClass = pillColors[i % pillColors.length];
      return `<span class="inline-block px-3 py-1 rounded-full text-xs font-semibold mr-2 mb-1 ${colorClass}">${name}</span>`;
    })
    .join('');
}

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

function generateAssetCell(asset) {
  const assetUrl = asset.url || '#';
  const assetCodename = asset.codename || 'unknown';
  return `
    <a href="${assetUrl}" target="_blank" rel="noopener noreferrer" class="flex items-center">
      <img src="${assetUrl}" alt="${assetCodename}" class="h-[50px] w-auto rounded mr-2" />
      <span class="underline text-blue-600 hover:text-blue-800">${assetCodename}</span>
    </a>
  `;
}

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

async function fetchAllAssets(envId, apiKey) {
  const url = `https://manage.kontent.ai/v2/projects/${envId}/assets?depth=all`;
  const json = await fetchKontent(url, apiKey);
  return json.assets || [];
}

async function fetchAllTaxonomies(envId, apiKey) {
  const url = `https://manage.kontent.ai/v2/projects/${envId}/taxonomies`;
  const json = await fetchKontent(url, apiKey);
  return json.taxonomies || [];
}

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

async function main() {
  const assetsSource = await fetchAllAssets(SOURCE_ENV_ID, SOURCE_MAPI_KEY);
  const taxonomySourceRaw = await fetchAllTaxonomies(
    SOURCE_ENV_ID,
    SOURCE_MAPI_KEY
  );
  const assetsTarget = await fetchAllAssets(TARGET_ENV_ID, TARGET_MAPI_KEY);
  const taxonomyTargetRaw = await fetchAllTaxonomies(
    TARGET_ENV_ID,
    TARGET_MAPI_KEY
  );

  const sourceTerms = flattenTerms(taxonomySourceRaw);
  const targetTerms = flattenTerms(taxonomyTargetRaw);

  const termIdMap = new Map();
  for (const sTerm of sourceTerms) {
    const tTerm = targetTerms.find((t) => t.codename === sTerm.codename);
    if (tTerm) termIdMap.set(sTerm.id, tTerm.id);
  }

  const reportRows = [];

  for (const sourceAsset of assetsSource) {
    const targetAsset = assetsTarget.find(
      (a) => a.codename === sourceAsset.codename
    );
    if (!targetAsset) continue;

    const updatedElements = [];
    const reportEntry = [];

    for (const sourceElement of sourceAsset.elements) {
      const elementId = sourceElement.element.id;
      const oldValue = sourceElement.value || [];

      const targetElement = targetAsset.elements.find(
        (e) => e.element.id === elementId
      );
      if (!targetElement) continue;

      const newValue = oldValue
        .map((v) => {
          const newId = termIdMap.get(v.id);
          if (!newId) return null;
          return { id: newId };
        })
        .filter(Boolean);

      updatedElements.push({ element: { id: elementId }, value: newValue });

      reportEntry.push({
        elementId,
        sourceTerms: oldValue
          .map((v) => sourceTerms.find((t) => t.id === v.id)?.name)
          .filter(Boolean),
        targetTerms: newValue
          .map((v) => targetTerms.find((t) => t.id === v.id)?.name)
          .filter(Boolean),
      });
    }

    if (updatedElements.length > 0) {
      reportRows.push({
        sourceAsset,
        targetAsset,
        updatedAssetPayload: { ...targetAsset, elements: updatedElements },
        reportEntry,
      });
    }
  }

  const html = `
  <!DOCTYPE html>
  <html lang="en">
  <head>
    <meta charset="UTF-8" />
    <title>Asset Taxonomy Update Report</title>
    <script src="https://cdn.tailwindcss.com"></script>
  </head>
  <body class="bg-gray-50 p-8">
    <h1 class="text-2xl font-bold mb-6">Asset Taxonomy Update Report</h1>
    <table class="w-full border-collapse border border-gray-300">
      <thead>
        <tr class="bg-gray-200">
          <th class="border border-gray-300 p-2 text-left">Source Asset</th>
          <th class="border border-gray-300 p-2 text-left">Source Taxonomies</th>
          <th class="border border-gray-300 p-2 text-left">Target Asset</th>
          <th class="border border-gray-300 p-2 text-left">Target Taxonomies (Pending Update)</th>
        </tr>
      </thead>
      <tbody>
        ${reportRows
          .map(
            ({ sourceAsset, targetAsset, reportEntry }) => `
          <tr class="hover:bg-gray-100">
            <td class="border border-gray-300 p-2 align-middle">${generateAssetCell(
              sourceAsset
            )}</td>
            <td class="border border-gray-300 p-2 align-middle">${reportEntry
              .map(
                (entry) =>
                  `<div><strong>${
                    entry.elementId
                  }</strong>${generateTaxPillsHtml(entry.sourceTerms)}</div>`
              )
              .join('')}</td>
            <td class="border border-gray-300 p-2 align-middle">${generateAssetCell(
              targetAsset
            )}</td>
            <td class="border border-gray-300 p-2 align-middle">${reportEntry
              .map(
                (entry) =>
                  `<div><strong>${
                    entry.elementId
                  }</strong>${generateTaxPillsHtml(entry.targetTerms)}</div>`
              )
              .join('')}</td>
          </tr>`
          )
          .join('')}
      </tbody>
    </table>
  </body>
  </html>
  `;

  const resultsFolder = path.resolve(process.cwd(), 'Results');
  await fs.mkdir(resultsFolder, { recursive: true });
  const htmlPath = path.join(
    resultsFolder,
    'asset-taxonomy-update-report.html'
  );
  await fs.writeFile(htmlPath, html, 'utf-8');
  console.log(`\nHTML report generated: ${htmlPath}`);
  await open(htmlPath);

  const rl = readline.createInterface({ input, output });
  const answer = await rl.question(
    'Do you want to proceed with updating the assets? (y/n): '
  );
  rl.close();

  if (answer.toLowerCase() !== 'y') {
    console.log('Aborted by user. No assets were updated.');
    process.exit(0);
  }

  for (const row of reportRows) {
    const { targetAsset, updatedAssetPayload, sourceAsset } = row;
    try {
      await updateAsset(
        TARGET_ENV_ID,
        TARGET_MAPI_KEY,
        targetAsset.id,
        updatedAssetPayload
      );
      console.log(`✅ Updated asset ${sourceAsset.codename}`);
    } catch (err) {
      console.error(
        `❌ Failed to update asset ${sourceAsset.codename}:`,
        err.message
      );
    }
  }
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
