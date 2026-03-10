const express = require('express');
const morgan = require('morgan');
const bodyParser = require('body-parser');
const fs = require('fs');
const path = require('path');

const app = express();
app.use(morgan('combined'));
app.use(bodyParser.json());

const startTime = Date.now();

let todoItems = [
  { todoItemId: 0, name: 'an item', priority: 3, completed: false },
  { todoItemId: 1, name: 'another item', priority: 2, completed: false },
  { todoItemId: 2, name: 'a done item', priority: 1, completed: true }
];

// ========================================== Utilities ==========================================

const containsInjectionAttempt = (val) => {
  if (typeof val !== 'string') return false;
  const patterns = [/<script[^>]*>[\s\S]*?<\/script>/gi, /javascript:/gi, /on\w+\s*=/gi, /(\b(SELECT|INSERT|UPDATE|DELETE|DROP|CREATE|ALTER|EXEC|EXECUTE)\b)/gi];
  return patterns.some(p => p.test(val));
};

const sanitizeString = (val) => typeof val === 'string' ? val.trim().replace(/[<>]/g, '') : val;

const validateTodoItem = (item) => {
  const errors = [];
  if (!item.name) errors.push('name is required');
  if (item.priority === undefined) errors.push('priority is required');
  if (item.completed === undefined) errors.push('completed is required');
  if (item.name && typeof item.name !== 'string') errors.push('name must be a string');
  if (item.priority && typeof item.priority !== 'number') errors.push('priority must be a number');
  if (item.completed && typeof item.completed !== 'boolean') errors.push('completed must be a boolean');
  if (item.priority && (item.priority < 1 || item.priority > 5)) errors.push('priority must be 1-5');
  if (item.name && item.name.length > 100) errors.push('name max 100 chars');
  if (item.name && containsInjectionAttempt(item.name)) errors.push('malicious content detected');
  return errors;
};

const sanitizeTodoItem = (item) => ({
  name: sanitizeString(item.name),
  priority: Number(item.priority),
  completed: Boolean(item.completed)
});

const logError = (error, endpoint, method) => {
  const msg = `[${new Date().toISOString()}] ${method} ${endpoint} - ${error}\n`;
  const dir = path.join(__dirname, '..', 'logs');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.appendFile(path.join(dir, 'error.log'), msg, err => { if (err) console.error(err); });
};

const findItem = (id) => todoItems.find(item => item.todoItemId === id);
const findItemIndex = (id) => todoItems.findIndex(item => item.todoItemId === id);
const errorResponse = (res, status, error, details = null) => res.status(status).json(details ? { error, details } : { error });

// ========================================== Routes ==========================================

app.get('/', (req, res) => {
  const uptime = Math.floor((Date.now() - startTime) / 1000);
  res.json({ status: `ok - app running for ${uptime} seconds` });
});

app.get('/api/TodoItems', (req, res) => {
  try {
    res.json(todoItems);
  } catch (error) {
    logError(error.message, '/api/TodoItems', 'GET');
    errorResponse(res, 500, 'Internal server error');
  }
});

app.get('/api/TodoItems/filter/completed', (req, res) => {
  try {
    res.json(todoItems.filter(i => i.completed));
  } catch (error) {
    logError(error.message, '/api/TodoItems/filter/completed', 'GET');
    errorResponse(res, 500, 'Internal server error');
  }
});

app.get('/api/TodoItems/filter/incomplete', (req, res) => {
  try {
    res.json(todoItems.filter(i => !i.completed));
  } catch (error) {
    logError(error.message, '/api/TodoItems/filter/incomplete', 'GET');
    errorResponse(res, 500, 'Internal server error');
  }
});

app.get('/api/TodoItems/:id', (req, res) => {
  try {
    const id = Number(req.params.id);
    if (isNaN(id)) return errorResponse(res, 400, 'Invalid ID format');
    const item = findItem(id);
    if (!item) return errorResponse(res, 404, 'Todo item not found');
    res.json(item);
  } catch (error) {
    logError(error.message, `/api/TodoItems/${req.params.id}`, 'GET');
    errorResponse(res, 500, 'Internal server error');
  }
});

app.post('/api/TodoItems', (req, res) => {
  try {
    const { name, priority, completed, todoItemId } = req.body;
    const errors = validateTodoItem({ name, priority, completed });
    if (errors.length) return errorResponse(res, 400, 'Validation failed', errors);
    
    const sanitized = sanitizeTodoItem({ name, priority, completed });
    const newItem = {
      todoItemId: todoItemId !== undefined ? todoItemId : Math.max(...todoItems.map(i => i.todoItemId), -1) + 1,
      ...sanitized
    };
    
    todoItems.push(newItem);
    res.status(201).json(newItem);
  } catch (error) {
    logError(error.message, '/api/TodoItems', 'POST');
    errorResponse(res, 500, 'Internal server error');
  }
});

app.put('/api/TodoItems/:id', (req, res) => {
  try {
    const id = Number(req.params.id);
    if (isNaN(id)) return errorResponse(res, 400, 'Invalid ID format');
    const idx = findItemIndex(id);
    if (idx === -1) return errorResponse(res, 404, 'Todo item not found');
    
    const { name, priority, completed } = req.body;
    const errors = validateTodoItem({ name, priority, completed });
    if (errors.length) return errorResponse(res, 400, 'Validation failed', errors);
    
    const sanitized = sanitizeTodoItem({ name, priority, completed });
    todoItems[idx] = { todoItemId: id, ...sanitized };
    res.json(todoItems[idx]);
  } catch (error) {
    logError(error.message, `/api/TodoItems/${req.params.id}`, 'PUT');
    errorResponse(res, 500, 'Internal server error');
  }
});

app.patch('/api/TodoItems/:id', (req, res) => {
  try {
    const id = Number(req.params.id);
    if (isNaN(id)) return errorResponse(res, 400, 'Invalid ID format');
    const idx = findItemIndex(id);
    if (idx === -1) return errorResponse(res, 404, 'Todo item not found');
    
    const item = todoItems[idx];
    const updates = {
      name: req.body.name !== undefined ? req.body.name : item.name,
      priority: req.body.priority !== undefined ? req.body.priority : item.priority,
      completed: req.body.completed !== undefined ? req.body.completed : item.completed
    };
    
    const errors = validateTodoItem(updates);
    if (errors.length) return errorResponse(res, 400, 'Validation failed', errors);
    
    const sanitized = sanitizeTodoItem(updates);
    Object.assign(item, sanitized);
    res.json(item);
  } catch (error) {
    logError(error.message, `/api/TodoItems/${req.params.id}`, 'PATCH');
    errorResponse(res, 500, 'Internal server error');
  }
});

app.delete('/api/TodoItems/:id', (req, res) => {
  try {
    const id = Number(req.params.id);
    if (isNaN(id)) return errorResponse(res, 400, 'Invalid ID format');
    const idx = findItemIndex(id);
    if (idx === -1) return errorResponse(res, 404, 'Todo item not found');
    
    const deleted = todoItems.splice(idx, 1)[0];
    res.json(deleted);
  } catch (error) {
    logError(error.message, `/api/TodoItems/${req.params.id}`, 'DELETE');
    errorResponse(res, 500, 'Internal server error');
  }
});

app.use((req, res) => {
  logError(`Not found: ${req.method} ${req.path}`, req.path, req.method);
  errorResponse(res, 404, 'Endpoint not found');
});

module.exports = app;
