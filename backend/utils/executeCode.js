const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

const tempDir = path.join(__dirname, '../temp');
if (!fs.existsSync(tempDir)) {
  fs.mkdirSync(tempDir, { recursive: true });
}

/**
 * Execute code in a separate process
 * @param {string} content - The code to run
 * @param {string} language - The language ('javascript' or 'python')
 * @returns {Promise} Resolves with { stdout, stderr, executionTime }
 */
const executeCode = (content, language) => {
  return new Promise((resolve, reject) => {
    let command, args, ext, compileCommand;
    const timestamp = Date.now();
    const random = Math.floor(Math.random() * 1000);

    if (language === 'javascript') {
      command = 'node';
      ext = '.js';
    } else if (language === 'python') {
      command = 'python'; 
      ext = '.py';
    } else if (language === 'java') {
      // For Java, we'll try to extract the class name or default to Main
      const classMatch = content.match(/public\s+class\s+(\w+)/);
      const className = classMatch ? classMatch[1] : 'Main';
      ext = '.java';
      
      // We'll create a unique subdirectory for this execution to avoid conflicts
      const execDir = path.join(tempDir, `java-${timestamp}-${random}`);
      if (!fs.existsSync(execDir)) fs.mkdirSync(execDir, { recursive: true });
      
      const filePath = path.join(execDir, `${className}.java`);
      fs.writeFileSync(filePath, content);

      const startTime = process.hrtime();
      
      // Step 1: Compile
      const javac = spawn('javac', [filePath]);
      let compileError = '';

      javac.stderr.on('data', (data) => {
        compileError += data.toString();
      });

      javac.on('close', (code) => {
        if (code !== 0) {
          // Cleanup
          fs.rmSync(execDir, { recursive: true, force: true });
          return resolve({
            stdout: '',
            stderr: `Compilation Error:\n${compileError}`,
            executionTime: '0s',
            exitCode: code
          });
        }

        // Step 2: Run
        const javaExec = spawn('java', ['-cp', execDir, className]);
        let output = '';
        let errorOutput = '';

        const timeout = setTimeout(() => {
          javaExec.kill();
          errorOutput += '\nExecution timed out (5 seconds).';
        }, 5000);

        javaExec.stdout.on('data', (data) => output += data.toString());
        javaExec.stderr.on('data', (data) => errorOutput += data.toString());

        javaExec.on('close', (runCode) => {
          clearTimeout(timeout);
          const endTime = process.hrtime(startTime);
          const executionTime = `${(endTime[0] + endTime[1] / 1e9).toFixed(2)}s`;

          // Cleanup
          fs.rmSync(execDir, { recursive: true, force: true });

          resolve({
            stdout: output,
            stderr: errorOutput,
            executionTime,
            exitCode: runCode
          });
        });
      });
      return; // Early return for Java since it has nested logic
    } else {
      return reject({ error: 'Unsupported language for execution' });
    }

    const filename = `temp-${timestamp}-${random}${ext}`;
    const filePath = path.join(tempDir, filename);

    fs.writeFileSync(filePath, content);

    const startTime = process.hrtime();
    
    const child = spawn(command, [filePath]);
    let output = '';
    let errorOutput = '';

    const timeout = setTimeout(() => {
      child.kill();
      errorOutput += '\nExecution timed out (5 seconds).';
    }, 5000);

    child.stdout.on('data', (data) => {
      output += data.toString();
    });

    child.stderr.on('data', (data) => {
      errorOutput += data.toString();
    });

    child.on('close', (code) => {
      clearTimeout(timeout);
      const endTime = process.hrtime(startTime);
      const executionTime = `${(endTime[0] + endTime[1] / 1e9).toFixed(2)}s`;

      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }

      resolve({
        stdout: output,
        stderr: errorOutput,
        executionTime,
        exitCode: code
      });
    });

    child.on('error', (err) => {
      clearTimeout(timeout);
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
      reject({ error: `Command failed: ${err.message}` });
    });
  });
};

module.exports = executeCode;
