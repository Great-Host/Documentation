const express = require('express');
const fs = require('fs-extra');
const path = require('path');
const { marked } = require('marked');
const hljs = require('highlight.js');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');

const app = express();
const PORT = process.env.PORT || 3000;

marked.setOptions({
  highlight: function(code, lang) {
    if (lang && hljs.getLanguage(lang)) {
      try {
        return hljs.highlight(code, { language: lang }).value;
      } catch (err) {}
    }
    return hljs.highlightAuto(code).value;
  },
  breaks: true,
  gfm: true
});

app.use(helmet({
  contentSecurityPolicy: false
}));
app.use(compression());
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

function getDirectoryStructure(dirPath, basePath = '') {
  const items = [];
  
  try {
    const files = fs.readdirSync(dirPath);
    
    files.forEach(file => {
      const fullPath = path.join(dirPath, file);
      const relativePath = path.join(basePath, file);
      const stat = fs.statSync(fullPath);
      
      if (stat.isDirectory()) {
        const children = getDirectoryStructure(fullPath, relativePath);
        items.push({
          name: file,
          type: 'directory',
          path: relativePath.replace(/\\/g, '/'),
          children: children
        });
      } else if (file.endsWith('.md')) {
        const name = file.replace('.md', '');
        items.push({
          name: name,
          type: 'file',
          path: relativePath.replace(/\\/g, '/').replace('.md', '')
        });
      }
    });
  } catch (error) {
    console.error('Error reading directory:', error);
  }
  
  return items;
}

function searchInFiles(query, dirPath = './docs') {
  const results = [];
  
  function searchRecursive(currentPath) {
    try {
      const files = fs.readdirSync(currentPath);
      
      files.forEach(file => {
        const fullPath = path.join(currentPath, file);
        const stat = fs.statSync(fullPath);
        
        if (stat.isDirectory()) {
          searchRecursive(fullPath);
        } else if (file.endsWith('.md')) {
          const content = fs.readFileSync(fullPath, 'utf8');
          const lines = content.split('\n');
          
          lines.forEach((line, index) => {
            if (line.toLowerCase().includes(query.toLowerCase())) {
              const relativePath = path.relative('./docs', fullPath)
                .replace(/\\/g, '/')
                .replace('.md', '');
              
              results.push({
                file: relativePath,
                line: index + 1,
                content: line.trim(),
                title: getFileTitle(fullPath)
              });
            }
          });
        }
      });
    } catch (error) {
      console.error('Error searching files:', error);
    }
  }
  
  searchRecursive(dirPath);
  return results;
}

function getFileTitle(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    const lines = content.split('\n');
    const titleLine = lines.find(line => line.startsWith('# '));
    return titleLine ? titleLine.replace('# ', '') : path.basename(filePath, '.md');
  } catch (error) {
    return path.basename(filePath, '.md');
  }
}

app.get('/api/navigation', (req, res) => {
  try {
    const structure = getDirectoryStructure('./docs');
    res.json(structure);
  } catch (error) {
    console.error('Error getting navigation:', error);
    res.status(500).json({ error: 'Error getting navigation' });
  }
});

app.get('/api/content/*', (req, res) => {
  try {
    const filePath = req.params[0];
    const fullPath = path.join('./docs', filePath + '.md');
    
    if (!fs.existsSync(fullPath)) {
      return res.status(404).json({ error: 'File not found' });
    }
    
    const content = fs.readFileSync(fullPath, 'utf8');
    const html = marked(content);
    const title = getFileTitle(fullPath);
    
    res.json({
      title: title,
      content: html,
      path: filePath
    });
  } catch (error) {
    console.error('Error getting content:', error);
    res.status(500).json({ error: 'Error getting content' });
  }
});

app.get('/api/search', (req, res) => {
  try {
    const query = req.query.q;
    if (!query || query.length < 2) {
      return res.json([]);
    }
    
    const results = searchInFiles(query);
    res.json(results.slice(0, 20));
  } catch (error) {
    console.error('Error searching:', error);
    res.status(500).json({ error: 'Search error' });
  }
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`\n🚀 GreatHost Documentation Server running on http://localhost:${PORT}\n`);
  
  try {
    const docsPath = path.join(__dirname, 'docs');
    if (fs.existsSync(docsPath)) {
      const items = fs.readdirSync(docsPath).filter(item => {
        return fs.statSync(path.join(docsPath, item)).isDirectory();
      });

      if (items.length > 0) {
        const title = "📚 Available Categories";
        const maxLen = Math.max(title.length, ...items.map(i => i.length + 2));
        const width = maxLen + 4;

        console.log('┌' + '─'.repeat(width) + '┐');
        console.log('│ ' + title.padEnd(width - 1) + '│');
        console.log('├' + '─'.repeat(width) + '┤');
        
        items.forEach(item => {
          console.log('│ ' + (`• ${item}`).padEnd(width - 1) + '│');
        });
        
        console.log('└' + '─'.repeat(width) + '┘');
      }
    }
  } catch (error) {
    console.log('   (Error listing categories)');
  }
});

process.on('uncaughtException', (error) => {
  console.error('Uncaught exception:', error);
});
