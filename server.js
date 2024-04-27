const express = require('express');
const http = require('http');
const bodyParser = require('body-parser');
const socketIO = require('socket.io');
const mysql = require('mysql2');
require('dotenv').config();
const app = express();
const server = http.createServer(app);
const io = socketIO(server);
const cors = require('cors');
app.use(cors());
app.use(bodyParser.json());

const connection = mysql.createConnection({
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_DATABASE
  });

connection.connect(err => {
    if (err) {
      console.error('데이터베이스 연결 실패: ' + err.stack);
      return;
    }
    console.log('데이터베이스에 성공적으로 연결됨. 연결 ID: ' + connection.threadId);
  });
  
  app.get('/api/hello', (req, res) => {
    const query = 'SELECT * FROM test';
    connection.query(query, (err, results, fields) => {
      if (err) {
        console.error('쿼리 실행 실패: ' + err.stack);
        res.status(500).json({error: '데이터베이스 쿼리 실행 중 오류 발생'});
        return;
      }
      res.json(results);
    });
  });

  app.post('/api/hello', (req, res) => {
    const { id, score } = req.body;
    const query = 'INSERT INTO test (id, score) VALUES (?, ?)';
  
    connection.query(query, [id, score], (error, results, fields) => {
      if (error) {
        console.error('데이터 삽입 실패:', error);
        res.status(500).json({ message: '데이터 삽입 실패' });
      } else {
        console.log('데이터 삽입 성공:', results);
        res.json({ message: '데이터 삽입 성공' });
      }
    });
  });

const PORT = 3000;
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
process.on('SIGINT', () => {
    connection.end(err => {
      if (err) {
        return console.error('연결 종료 중 에러 발생: ', err.stack);
      }
      console.log('데이터베이스 연결이 성공적으로 닫혔습니다.');
      process.exit(0);
    });
  });