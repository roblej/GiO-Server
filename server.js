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
const bcrypt = require('bcrypt');
const path = require('path');


app.use(cors());
app.use(bodyParser.json());

// WebGL용 서브 애플리케이션과 서버 설정
const webglApp = express();

function setGzipHeader(req, res, next) {
  const gzExtension = '.gz';
  const requestedPath = req.path;

  // 요청된 경로가 .gz로 끝나면 헤더 설정
  if (requestedPath.endsWith(gzExtension)) {
    res.setHeader('Content-Encoding', 'gzip');
    res.setHeader('Content-Type', 'application/gzip'); // 올바른 MIME 타입 설정
  }
  next();
}

// 미들웨어를 정적 파일 서빙 전에 적용
webglApp.use(cors())
webglApp.use(setGzipHeader);
webglApp.use(express.static('WebGLTest1'));



const WEBGL_PORT = 8080;
const webglServer = http.createServer(webglApp);
webglServer.listen(WEBGL_PORT, () => {
  console.log(`WebGL 서버가 ${WEBGL_PORT}번 포트에서 실행중입니다.`);
});


const saltRounds = 10; // 비밀번호 해싱 시 사용할 솔트 라운드 수

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
  
  app.post('/login', (req, res) => {
    const { id, password } = req.body;
  
    const query = 'SELECT id, password FROM user WHERE id = ?';
    connection.query(query, [id], async (err, results) => {
      if (err) {
        console.error('로그인 중 데이터베이스 조회 오류:', err);
        res.status(500).json({ message: '로그인 실패' });
        return;
      }
  
      if (results.length === 0) {
        res.status(401).json({ message: '잘못된 사용자 ID 또는 비밀번호' });
        return;
      }
  
      const user = results[0];
      // 데이터베이스에 저장된 해시와 입력된 비밀번호 비교
      try {
        const match = await bcrypt.compare(password, user.password);
        if (match) {
          res.json({ message: '로그인 성공' });
        } else {
          res.status(401).json({ message: '잘못된 사용자 ID 또는 비밀번호' });
        }
      } catch (error) {
        console.error('비밀번호 비교 중 오류:', error);
        res.status(500).json({ message: '서버 오류 발생' });
      }
    });
  });

  app.post('/register', async (req, res) => {
    const { id, password } = req.body;
  
    // 먼저 ID가 이미 존재하는지 확인
    const idCheckQuery = 'SELECT id FROM user WHERE id = ?';
    connection.query(idCheckQuery, [id], async (err, results) => {
      if (err) {
        console.error('데이터베이스 조회 오류:', err);
        res.status(500).json({ message: '데이터베이스 조회 중 오류 발생' });
        return;
      }
  
      // 결과가 있다면, 이미 해당 ID가 존재한다는 것을 의미
      if (results.length > 0) {
        res.status(409).json({ message: '중복된 아이디입니다.' }); // 409 Conflict 상태 코드 사용
        return;
      }
  
      // ID가 중복되지 않은 경우, 비밀번호 해싱 후 새로운 유저 등록
      try {
        const hashedPassword = await bcrypt.hash(password, saltRounds);
        const insertQuery = 'INSERT INTO user (id, password) VALUES (?, ?)';
        connection.query(insertQuery, [id, hashedPassword], (err, results) => {
          if (err) {
            console.error('회원가입 실패:', err);
            res.status(500).json({ message: '회원가입 실패' });
            return;
          }
          console.log('회원가입 성공:', results);
          res.status(201).json({ message: '회원가입 성공' });
        });
      } catch (error) {
        console.error('비밀번호 해싱 실패:', error);
        res.status(500).json({ message: '서버 오류 발생' });
      }
    });
  });
  
  app.get('/api/gamescore', (req, res) => {
    const userId = req.query.id;
    const gameName = req.query.game_name;
    const query = 'SELECT * FROM game_score WHERE id = ? AND game_name = ?';

    connection.query(query, [userId, gameName], (err, results, fields) => {
      if (err) {
        console.error('쿼리 실행 실패: ' + err.stack);
        res.status(500).json({error: '데이터베이스 쿼리 실행 중 오류 발생'});
        return;
      }
      res.json(results);
    });
  });

  app.post('/api/gamescore', (req, res) => {
    const { id, game_name, score } = req.body;
    const query = 'INSERT INTO game_score (id, game_name ,score) VALUES (?, ?, ?)';
  
    connection.query(query, [id, game_name ,score], (error, results, fields) => {
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