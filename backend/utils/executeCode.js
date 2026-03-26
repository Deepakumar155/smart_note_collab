const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const { NodeVM } = require('vm2');

const tempDir = path.join(__dirname, '../temp');
if (!fs.existsSync(tempDir)) {
  fs.mkdirSync(tempDir, { recursive: true });
}

/**
 * Execute code in a sandboxed environment
 */
const executeCode = (content, language) => {
  return new Promise((resolve, reject) => {
    const timestamp = Date.now();
    const random = Math.floor(Math.random() * 1000);
    const startTime = process.hrtime();

    // --- CASE 1: JAVASCRIPT (Sanded via vm2) ---
    if (language === 'javascript') {
      const vm = new NodeVM({
        console: 'redirect',
        sandbox: {},
        require: false,
        wrapper: 'none',
        timeout: 5000,
        wasm: false,
      });

      let output = '';
      vm.on('console.log', (data) => output += data + '\n');
      vm.on('console.error', (data) => output += 'Error: ' + data + '\n');

      try {
        vm.run(content);
        const endTime = process.hrtime(startTime);
        resolve({
          stdout: output,
          stderr: '',
          executionTime: `${(endTime[0] + endTime[1] / 1e9).toFixed(2)}s`,
          exitCode: 0
        });
      } catch (err) {
        resolve({
          stdout: output,
          stderr: err.message,
          executionTime: '0s',
          exitCode: 1
        });
      }
      return;
    }

    // --- CASE 2: OTHERS (Restricted Spawn) ---
    let command, args, ext;
    if (language === 'python') {
      command = 'python';
      ext = '.py';
    } else if (language === 'java') {
      // Logic for java compilation and then restricted spawn...
      // (Simplified here for space, but keeping the restricted principle)
      const classMatch = content.match(/public\s+class\s+(\w+)/);
      const className = classMatch ? classMatch[1] : 'Main';
      const execDir = path.join(tempDir, `java-${timestamp}-${random}`);
      if (!fs.existsSync(execDir)) fs.mkdirSync(execDir, { recursive: true });
      const filePath = path.join(execDir, `${className}.java`);
      fs.writeFileSync(filePath, content);

      const javac = spawn('javac', [filePath], { env: {} });
      let compileError = '';
      javac.stderr.on('data', (d) => compileError += d);
      javac.on('close', (c) => {
        if (c !== 0) {
          fs.rmSync(execDir, { recursive: true, force: true });
          return resolve({ stdout: '', stderr: `Compilation Error:\n${compileError}`, executionTime: '0s', exitCode: c });
        }
        const javaExec = spawn('java', ['-cp', execDir, className], { env: {}, timeout: 5000 });
        let out = '', err = '';
        javaExec.stdout.on('data', (d) => out += d);
        javaExec.stderr.on('data', (d) => err += d);
        javaExec.on('close', (rc) => {
          const et = process.hrtime(startTime);
          fs.rmSync(execDir, { recursive: true, force: true });
          resolve({ stdout: out, stderr: err, executionTime: `${(et[0]+et[1]/1e9).toFixed(2)}s`, exitCode: rc });
        });
      });
      return;
    } else {
      return reject({ error: 'Unsupported language' });
    }

    const filename = `temp-${timestamp}-${random}${ext}`;
    const filePath = path.join(tempDir, filename);
    fs.writeFileSync(filePath, content);

    // Restricted spawn with empty env to prevent access to process.env secrets
    const child = spawn(command, [filePath], {
      env: {}, // CRITICAL: Strip all environment variables
      timeout: 5000
    });

    let stdout = '', stderr = '';
    const timeout = setTimeout(() => { child.kill(); stderr += '\nTimeout (5s)'; }, 5000);

    child.stdout.on('data', (d) => stdout += d);
    child.stderr.on('data', (d) => stderr += d);
    child.on('close', (code) => {
      clearTimeout(timeout);
      const endTime = process.hrtime(startTime);
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
      resolve({
        stdout,
        stderr,
        executionTime: `${(endTime[0] + endTime[1] / 1e9).toFixed(2)}s`,
        exitCode: code
      });
    });
  });
};

module.exports = executeCode;
