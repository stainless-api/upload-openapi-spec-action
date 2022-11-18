import fs from 'fs';
import { getInput } from '@actions/core';
import { error, info } from 'console';
import { writeFile } from 'fs-extra';
import fetch from 'node-fetch';
import FormData from 'form-data';

export async function main() {
  // inputs
  const stainless_api_key = getInput('stainless_api_key', { required: true });
  const inputPath = getInput('input_path', { required: true });
  const outputPath = getInput('output_path');

  const decoratedSpec = await decorateSpec(inputPath, stainless_api_key);

  if (outputPath) {
    writeFile(outputPath, decoratedSpec);
    info('Wrote spec to', outputPath);
  }
}

type SignedUploadResponse = {
  // Which key the upload is going to
  fileKey: string;

  // Which URL to POST an upload to
  url: string;

  // Which fields to include in the POST
  fields: { [key: string]: string };
};

async function createSignedUpload(token: string): Promise<SignedUploadResponse> {
  const response = await fetch('https://api.stainlessapi.com/api/spec/upload', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    const errorMsg = `Failed to create a signed upload: ${response.statusText} ${response.text}`;
    error(errorMsg);
    throw Error(errorMsg);
  }

  return response.json() as unknown as SignedUploadResponse;
}

async function uploadSpec(specPath: string, upload: SignedUploadResponse) {
  const { fields, url } = upload;
  const formData = new FormData();

  // Add the required fields for S3 upload
  Object.entries(fields).forEach(([key, value]) => {
    formData.append(key, value as string);
  });

  // Attach the actual spec file
  const stats = fs.statSync(specPath);
  formData.append('file', fs.createReadStream(specPath), { knownLength: stats.size });

  const response = await fetch(url, {
    method: 'POST',
    body: formData,
  });

  if (!response.ok) {
    const errorMsg = `Failed to upload spec: ${response.statusText} ${response.text}`;
    error(errorMsg);
    throw Error(errorMsg);
  }
}

async function decorateSpec(specPath: string, token: string): Promise<string> {
  info('Getting a signed upload URL...');
  const signedUpload = await createSignedUpload(token);

  info('Uploading the spec file...');
  await uploadSpec(specPath, signedUpload);

  info('Decorating spec...');
  const response = await fetch('https://api.stainlessapi.com/api/spec', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      uploadedFileKey: signedUpload.fileKey,
    }),
  });

  if (!response.ok) {
    const errorMsg = `Failed to decorate spec: ${response.statusText} ${response.text}`;
    error(errorMsg);
    throw Error(errorMsg);
  }

  info('Decorated spec');
  return response.text();
}

if (require.main === module) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
