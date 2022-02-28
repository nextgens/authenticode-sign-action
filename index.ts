import * as core from '@actions/core';
import { promises as fs } from 'fs';
import { unlinkSync, existsSync, createWriteStream } from 'fs';
import path from 'path';
import util from 'util';
import { exec } from 'child_process';
import { env } from 'process';
const request = require('request');

const asyncExec = util.promisify(exec);
const certificateFileName = env['TEMP'] + '\\cert.pem';
const signtool = env['TEMP'] + '\\signtool.exe';
const credentialsFileName = env['TEMP'] + '\\creds.json';
const toSignFileName = env['TEMP'] + '\\tosign.txt';

const signtoolFileExtensions = [
    '.dll', '.exe', '.sys', '.vxd',
    '.msix', '.msixbundle', '.appx',
    '.appxbundle', '.msi', '.msp',
    '.msm', '.cab', '.ps1', '.psm1'
];

function sleep(seconds: number) {
    if (seconds > 0)
        console.log(`Waiting for ${seconds} seconds.`);
    return new Promise(resolve => setTimeout(resolve, seconds * 1000));
}

async function createCertificate() {
    const base64Certificate = core.getInput('certificate');
    const certificate = Buffer.from(base64Certificate, 'base64');
    if (certificate.length == 0) {
        console.log('The value for "certificate" is not set.');
        return false;
    }
    console.log(`Writing ${certificate.length} bytes to ${certificateFileName}.`);
    await fs.writeFile(certificateFileName, certificate);
    return true;
}

async function createCredentials() {
    const base64Certificate = core.getInput('credentials');
    const credentials = Buffer.from(base64Certificate, 'base64');
    if (credentials.length == 0) {
        console.log('The value for "credentials" is not set.');
        return false;
    }
    console.log(`Writing ${credentials.length} bytes to ${credentialsFileName}.`);
    await fs.writeFile(credentialsFileName, credentials);
    return true;
}

function downloadCloudSignTool() {
        if (existsSync(signtool)) {
            return;
        }

        console.log(`Downloading signtool.exe.`);

        request('https://github.com/nextgens/CloudSignTool/releases/download/1.0.0/SignTool.exe').pipe(createWriteStream(signtool));
}

async function signWithCloudSigntool() {
        try {
        var options = "";
        const timestampUrl = core.getInput('timestamp-url');
        if(timestampUrl != "") {
    	options += ` -tr \"${timestampUrl}\"`
        }
        const description = core.getInput('description');
        if(description != "") {
    	options += ` -d \"${description}\"`
        }
        const descriptionURL = core.getInput('description-url');
        if(descriptionURL != "") {
    	options += ` -du \"${descriptionURL}\"`
    	}
    	if(core.getInput('page-hash') == "true") {
    	    options += ` -ph`
    	} else {
    	    options += ` -nph`
    	}
    	const cmd = `"${signtool}" sign -kac "${credentialsFileName}" -ac "${certificateFileName}" ${options} -k "${core.getInput('key-uri')}" -ifl "${toSignFileName}"`;
    	console.log(cmd);
    	const { stdout } = await asyncExec(cmd);
    	console.log(stdout);
    	return true;
        } catch(err) {
    	console.log(err.stdout);
    	console.log(err.stderr);
    	return false;
        }
}

async function* getFiles(folder: string, recursive: boolean): any {
    const files = await fs.readdir(folder);
    for (const file of files) {
        const fullPath = `${folder}/${file}`;
        const stat = await fs.stat(fullPath);
        if (stat.isFile()) {
            const extension = path.extname(file);
            if (signtoolFileExtensions.includes(extension))
                yield fullPath;
        }
        else if (stat.isDirectory() && recursive) {
            yield* getFiles(fullPath, recursive);
        }
    }
}

async function signFiles() {
    const folder = core.getInput('folder', { required: true });
    const recursive = core.getInput('recursive') == 'true';

    console.log(`Getting ready to sign the following files:`);
    let buffer: string[] = [];
    for await (const file of getFiles(folder, recursive)) {
       console.log(`   ${file}`);
       buffer.push(file);
    }
    if(buffer.length > 0) {
       await fs.writeFile(toSignFileName, buffer.join("\r\n"));
       console.log(`Getting ready to talk to the cloud.`);
       for (let i=0;i<6;i++) {
           await sleep(2 ** i);
	   if(await signWithCloudSigntool()) { return; }
       }
       throw `Failed to sign`; 
    }
}

async function run() {
    try {
	await createCredentials();
	downloadCloudSignTool();
	if (await createCertificate())
	    await signFiles();
    }
    catch (err) {
        core.setFailed(`Action failed with error: ${err}`);
    }
    unlinkSync(credentialsFileName);
}

run();
