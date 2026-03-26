const executeCode = require('../utils/executeCode');
const Room = require('../models/Room');

module.exports = (io, socket) => {
  socket.on('run-code', async ({ roomId, filename }) => {
    // 1. Fetch code from MongoDB
    let room;
    try {
      room = await Room.findOne({ roomId });
      if (!room) throw new Error('Room not found');
    } catch (err) {
      socket.emit('terminal-output', {
        roomId,
        filename,
        output: 'Error fetching room from database.',
        error: true
      });
      return;
    }

    const file = room.files.find(f => f.filename === filename);
    if (!file) {
      socket.emit('terminal-output', {
        roomId,
        filename,
        output: `File ${filename} not found in MongoDB.`,
        error: true
      });
      return;
    }

    const content = file.content;

    // Deduce language from filename extension
    let language;
    const ext = filename.split('.').pop();
    if (ext === 'py') language = 'python';
    else if (ext === 'js') language = 'javascript';
    else if (ext === 'java') language = 'java';
    else language = 'unsupported';

    if (language === 'unsupported') {
      socket.emit('terminal-output', {
        roomId,
        filename,
        output: 'Currently, only .js, .py, and .java files are supported for execution.',
        error: true
      });
      return;
    }

    console.log(`EXECUTION REQUEST (from DB): room=${roomId}, file=${filename}, lang=${language}`);

    // Broadcast to others that execution started
    io.to(roomId).emit('terminal-output', {
      roomId,
      filename,
      output: `Running ${filename} (source: MongoDB)...\n`,
      error: false,
      isRunning: true
    });

    try {
      const result = await executeCode(content, language);
      console.log(`EXECUTION RESULT: room=${roomId}, file=${filename}, exitCode=${result.exitCode}`);
      
      let outputMessage = '';
      if (result.stdout) outputMessage += result.stdout;
      if (result.stderr) {
        if (outputMessage) outputMessage += '\n';
        outputMessage += `Error:\n${result.stderr}`;
      }
      
      outputMessage += `\n\nExecution completed in ${result.executionTime}`;

      io.to(roomId).emit('terminal-output', {
        roomId,
        filename,
        output: outputMessage,
        error: !!result.stderr,
        isRunning: false
      });
    } catch (err) {
      console.error(`EXECUTION ERROR: room=${roomId}, file=${filename}`, err);
      io.to(roomId).emit('terminal-output', {
        roomId,
        filename,
        output: err.error || 'Execution failed',
        error: true,
        isRunning: false
      });
    }
  });
};
