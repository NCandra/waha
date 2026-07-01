// eslint-disable-next-line @typescript-eslint/no-var-requires
const fs = require('fs');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const path = require('path');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const axios = require('axios');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { execSync } = require('child_process');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const yargs = require('yargs');

// Defaults
const CONFIG_FILE = 'waha.config.json';
// Load defaults from package.json
gows = (() => {
  try {
    const config = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
    return config.waha.gows || {};
  } catch (error) {
    return {};
  }
})();

const DEFAULT_REPO = gows.repo;
if (!DEFAULT_REPO) {
  throw new Error(`Missing default repo in ${CONFIG_FILE}`);
}
const DEFAULT_REF = gows.ref;
if (!DEFAULT_REF) {
  throw new Error('Missing default ref in ${CONFIG_FILE}');
}
const DEFAULT_DIR = './src/core/engines/gows/proto';

const PROTO_FILES = ['gows.proto'];
const PROTO_OUTPUT = './src/core/engines/gows/grpc';

// Helper function to clean directory
function cleanDirectory(directory, suffix) {
  if (!fs.existsSync(directory)) {
    fs.mkdirSync(directory, { recursive: true });
    return;
  }

  const files = fs.readdirSync(directory);
  for (const file of files) {
    const filePath = path.join(directory, file);
    if (file.endsWith(suffix)) {
      fs.unlinkSync(filePath);
    }
  }
}

// Helper function to download files
async function downloadFiles(repo, ref, directory) {
  for (const file of PROTO_FILES) {
    const url = `https://github.com/${repo}/releases/download/${ref}/${file}`;
    const filePath = path.join(directory, file);
    try {
      const response = await axios.get(url, { responseType: 'arraybuffer' });
      fs.writeFileSync(filePath, response.data);
      console.log(`Downloaded: ${file}`);
    } catch (error) {
      console.error(`Failed to download ${file}: ${error.message}`);
    }
  }
}

function patchProtoFile(filePath) {
  let content = fs.readFileSync(filePath, 'utf8');
  if (content.includes('SendPasskeyResponse')) {
    return;
  }

  const serviceIndex = content.indexOf('service MessageService {');
  if (serviceIndex === -1) {
    throw new Error('MessageService not found in proto file');
  }

  const closingBraceRegex = /\n\s*}\s*\n/;
  const match = content.slice(serviceIndex).match(closingBraceRegex);
  if (!match) {
    throw new Error('Closing brace for MessageService not found');
  }

  const matchIndex = serviceIndex + match.index;
  const insertIndex = matchIndex + 1;

  const passkeyRpcs = `\n  //\n  // Passkeys\n  //\n  rpc SendPasskeyResponse(SendPasskeyResponseRequest) returns (Empty);\n  rpc SendPasskeyConfirmation(Session) returns (Empty);\n`;

  content = content.slice(0, insertIndex) + passkeyRpcs + content.slice(insertIndex);

  const passkeyMessages = `\n//\n// Passkeys\n//\nmessage SendPasskeyResponseRequest {\n  Session session = 1;\n  string responseJson = 2;\n}\n`;

  content += passkeyMessages;

  fs.writeFileSync(filePath, content, 'utf8');
  console.log(`Patched: ${filePath} with passkey definitions`);
}

// Handler for fetch command
async function handleFetch(repo, ref, dir) {
  console.log(`Fetching .proto files from ${repo}@${ref} to ${dir}...`);
  cleanDirectory(dir, '.proto');
  await downloadFiles(repo, ref, dir);

  const protoPath = path.join(dir, 'gows.proto');
  if (fs.existsSync(protoPath)) {
    patchProtoFile(protoPath);
  }
}


// Handler for build command
function handleBuild(dir) {
  console.log('Building gRPC files...');
  cleanDirectory(PROTO_OUTPUT);

  const command = `grpc_tools_node_protoc \
        --plugin=protoc-gen-ts=node_modules/.bin/protoc-gen-ts \
        --plugin=protoc-gen-grpc=node_modules/.bin/grpc_tools_node_protoc_plugin \
        --js_out=import_style=commonjs,binary:${PROTO_OUTPUT} \
        --grpc_out=grpc_js:${PROTO_OUTPUT} \
        --ts_out=grpc_js:${PROTO_OUTPUT} \
        -I ${dir} ${dir}/gows.proto`;

  // const command = `grpc_tools_node_protoc \
  //   --plugin=protoc-gen-ts=node_modules/.bin/protoc-gen-ts.cmd \
  //   --plugin=protoc-gen-grpc=node_modules/.bin/grpc_tools_node_protoc_plugin.cmd \
  //   --js_out=import_style=commonjs,binary:${PROTO_OUTPUT} \
  //   --grpc_out=grpc_js:${PROTO_OUTPUT} \
  //   --ts_out=grpc_js:${PROTO_OUTPUT} \
  //   -I ${dir} ${dir}/gows.proto`;

  try {
    execSync(command, { stdio: 'inherit' });
    console.log('gRPC files built successfully.');
  } catch (error) {
    console.error(`Failed to build gRPC files: ${error.message}`);
  }
}

//
// Commands
//

// fetch
yargs.command(
  'fetch',
  'Fetch .proto files from GitHub',
  (yargs) => {
    yargs
      .option('repo', {
        describe: 'GitHub repository (owner/repo)',
        type: 'string',
        default: DEFAULT_REPO,
      })
      .option('ref', {
        describe: 'Git reference (branch or commit SHA)',
        type: 'string',
        default: DEFAULT_REF,
      })
      .option('dir', {
        describe: 'Directory to output .proto files',
        type: 'string',
        default: DEFAULT_DIR,
      });
  },
  async (argv) => {
    await handleFetch(argv.repo, argv.ref, argv.dir);
  },
);

// build
yargs.command(
  'build',
  'Build gRPC files from .proto files',
  (yargs) => {
    yargs.option('dir', {
      describe: 'Directory containing .proto files',
      type: 'string',
      default: DEFAULT_DIR,
    });
  },
  (argv) => {
    handleBuild(argv.dir);
  },
);

// Parse arguments
yargs.parse();
