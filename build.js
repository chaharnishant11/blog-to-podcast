// Build script for Blog-to-Podcast Chrome extension
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const archiver = require('archiver');

// Configuration
const config = {
  srcDir: path.join(__dirname, 'src'),
  distDir: path.join(__dirname, 'dist'),
  buildDir: path.join(__dirname, 'dist', 'blog-to-podcast'),
  zipFile: path.join(__dirname, 'dist', 'blog-to-podcast.zip'),
  manifestPath: path.join(__dirname, 'src', 'manifest.json')
};

// Create dist directory if it doesn't exist
if (!fs.existsSync(config.distDir)) {
  fs.mkdirSync(config.distDir, { recursive: true });
}

// Create build directory if it doesn't exist
if (!fs.existsSync(config.buildDir)) {
  fs.mkdirSync(config.buildDir, { recursive: true });
} else {
  // Clean build directory
  console.log('Cleaning build directory...');
  fs.readdirSync(config.buildDir).forEach(file => {
    const filePath = path.join(config.buildDir, file);
    if (fs.lstatSync(filePath).isDirectory()) {
      fs.rmSync(filePath, { recursive: true, force: true });
    } else {
      fs.unlinkSync(filePath);
    }
  });
}

// Read manifest to get version
const manifest = JSON.parse(fs.readFileSync(config.manifestPath, 'utf8'));
const version = manifest.version;

console.log(`Building Blog-to-Podcast v${version}...`);

// Copy all files from src to build directory
console.log('Copying files to build directory...');
function copyDir(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  const entries = fs.readdirSync(src, { withFileTypes: true });

  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);

    if (entry.isDirectory()) {
      copyDir(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
      console.log(`Copied: ${srcPath} -> ${destPath}`);
    }
  }
}

copyDir(config.srcDir, config.buildDir);

// Ensure icons directory exists
const iconsDir = path.join(config.buildDir, 'icons');
if (!fs.existsSync(iconsDir)) {
  fs.mkdirSync(iconsDir, { recursive: true });
  console.log('Created icons directory');
}

// Check if icon files exist, create placeholders if not
const iconSizes = [16, 32, 48, 128];
iconSizes.forEach(size => {
  const iconPath = path.join(iconsDir, `icon${size}.png`);
  if (!fs.existsSync(iconPath)) {
    console.log(`Creating placeholder icon: ${iconPath}`);
    // This is a simple way to create a placeholder PNG
    // In a real scenario, you'd want to use a proper image library
    try {
      execSync(`convert -size ${size}x${size} xc:blue ${iconPath}`);
      console.log(`Created icon: ${iconPath}`);
    } catch (error) {
      console.warn(`Could not create icon with ImageMagick, creating empty file: ${iconPath}`);
      fs.writeFileSync(iconPath, Buffer.alloc(100)); // Create a small binary file
    }
  }
});

// Create zip file
function createZip() {
  return new Promise((resolve, reject) => {
    const output = fs.createWriteStream(config.zipFile);
    const archive = archiver('zip', {
      zlib: { level: 9 } // Maximum compression
    });

    output.on('close', () => {
      console.log(`Archive created: ${config.zipFile}`);
      console.log(`Total size: ${archive.pointer()} bytes`);
      resolve();
    });

    archive.on('error', (err) => {
      reject(err);
    });

    archive.pipe(output);

    // Add all files from build directory
    archive.directory(config.buildDir, false);

    archive.finalize();
  });
}

// Main execution
async function main() {
  try {
    console.log('Build process started...');
    
    // Create zip file
    await createZip();
    
    console.log('Build completed successfully!');
    console.log(`Extension is ready in: ${config.buildDir}`);
    console.log(`Zip file created at: ${config.zipFile}`);
    console.log('\nTo load the extension in Chrome:');
    console.log('1. Go to chrome://extensions/');
    console.log('2. Enable Developer mode');
    console.log('3. Click "Load unpacked"');
    console.log(`4. Select the directory: ${config.buildDir}`);
  } catch (error) {
    console.error('Build failed:', error);
    process.exit(1);
  }
}

// Run the build process
main();
