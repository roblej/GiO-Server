const express = require('express');
const http = require('http');
const bodyParser = require('body-parser');
// const socketIO = require('socket.io');
const mysql = require('mysql2');
require('dotenv').config();
const app = express();
const server = http.createServer(app);
// const io = socketIO(server);
const cors = require('cors');
const bcrypt = require('bcrypt');
const path = require('path');

app.use(cors());
app.use(bodyParser.json());

// WebGL용 서브 애플리케이션과 서버 설정
const webglApp = express();

function setCustomHeaders(req, res, next) {
  const ext = path.extname(req.path);

  switch (ext) {
    case '.wasm':
      res.setHeader('Content-Type', 'application/wasm');
      break;
    case '.gz':
      res.setHeader('Content-Encoding', 'gzip');
      if (req.path.endsWith('.data.gz')) {
        res.setHeader('Content-Type', 'application/octet-stream');
      } else if (req.path.endsWith('.js.gz')) {
        res.setHeader('Content-Type', 'application/javascript');
      } else if (req.path.endsWith('.wasm.gz')) {
        res.setHeader('Content-Type', 'application/wasm');
      } else {
        res.setHeader('Content-Type', 'application/gzip');
      }
      break;
    default:
      break;
  }
  next();
}

// 미들웨어를 정적 파일 서빙 전에 적용
webglApp.use(cors());
webglApp.use(setCustomHeaders);
webglApp.use(express.static('MiniGames'));

const WEBGL_PORT = 8080;
const webglServer = http.createServer(webglApp);
webglServer.listen(WEBGL_PORT, () => {
  console.log(`WebGL 서버가 ${WEBGL_PORT}번 포트에서 실행 중입니다.`);
});

const saltRounds = 10; // 비밀번호 해싱 시 사용할 솔트 라운드 수

const dbConfig = {
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_DATABASE,
  wait_timeout: 86400, // 24시간
  connectTimeout: 60000 // 60초
};

let connection;

function handleDisconnect() {
  connection = mysql.createConnection(dbConfig);

  connection.connect(err => {
    if (err) {
      console.error('데이터베이스 연결 실패: ', err);
      setTimeout(handleDisconnect, 2000); // 2초 후에 재연결 시도
    } else {
      console.log('데이터베이스에 성공적으로 연결됨. 연결 ID: ' + connection.threadId);
    }
  });

  connection.on('error', err => {
    console.error('데이터베이스 오류:', err);
    if (err.code === 'PROTOCOL_CONNECTION_LOST') {
      handleDisconnect(); // 연결이 끊어진 경우 재연결
    } else {
      throw err;
    }
  });
}

handleDisconnect();

function keepAlive() {
  connection.query('SELECT 1', (err) => {
    if (err) {
      console.error('Keep-alive query failed:', err);
      handleDisconnect(); // 재연결 시도
    } else {
      console.log('Keep-alive query executed successfully');
    }
  });
}

// 5분마다 (300,000ms) Keep-alive 쿼리 실행
setInterval(keepAlive, 3000000);


app.post('/login', (req, res) => {
  const { id, password } = req.body;

  const query = 'SELECT id, password, gender FROM user WHERE id = ?';
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
        res.json({ message: '로그인 성공', gender: user.gender });
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
  const { id, password, name, gender, birthdate, email } = req.body;

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

      // 유저 정보를 DB에 삽입하는 쿼리 (name, gender, birthdate, email 추가)
      const insertQuery = 'INSERT INTO user (id, password, name, gender, birthdate, email) VALUES (?, ?, ?, ?, ?, ?)';
      connection.query(insertQuery, [id, hashedPassword, name, gender, birthdate, email], (err, results) => {
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

app.post('/addStickerRow', (req, res) => {
  const { id } = req.body;

  const stickerInsertQuery = 'INSERT INTO stickers (id) VALUES (?)';
  connection.query(stickerInsertQuery, [id], (err, results) => {
    if (err) {
      console.error('스티커 row 추가 실패:', err);
      res.status(500).json({ message: '스티커 row 추가 실패' });
      return;
    }
    console.log('스티커 row 추가 성공:', results);
    res.status(201).json({ message: '스티커 row 추가 성공' });
  });
});

app.post('/addProcessRow', (req, res) => {
  const { id } = req.body;

  const processInsertQuery = 'INSERT INTO process (id) VALUES (?)';
  connection.query(processInsertQuery, [id], (err, results) => {
    if (err) {
      console.error('진행도 row 추가 실패:', err);
      res.status(500).json({ message: '진행도 row 추가 실패' });
      return;
    }
    console.log('진행도 row 추가 성공:', results);
    res.status(201).json({ message: '진행도 row 추가 성공' });
  });
});

app.get('/getSticker/:id', (req, res) => {
  const { id } = req.params;

  const selectQuery = 'SELECT * FROM stickers WHERE id = ?';
  connection.query(selectQuery, [id], (err, results) => {
    if (err) {
      console.error('스티커 조회 실패:', err);
      res.status(500).json({ message: '스티커 조회 실패' });
      return;
    }

    if (results.length === 0) {
      res.status(404).json({ message: '사용자를 찾을 수 없습니다.' });
      return;
    }

    console.log('스티커 조회 성공:', results);
    res.status(200).json(results[0]);
  });
});

app.post('/updateSticker', (req, res) => {
  const { id, stickerNumber } = req.body;

  if (!id || !stickerNumber) {
    return res.status(400).json({ message: 'id와 stickerNumber를 모두 제공해야 합니다.' });
  }

  // stickerNumber를 이용해 업데이트할 컬럼을 동적으로 생성
  const column = `sticker${stickerNumber}`;

  const updateQuery = `UPDATE stickers SET ${column} = 1 WHERE id = ?`;
  connection.query(updateQuery, [id], (err, results) => {
    if (err) {
      console.error('스티커 업데이트 실패:', err);
      res.status(500).json({ message: '스티커 업데이트 실패' });
      return;
    }

    if (results.affectedRows === 0) {
      res.status(404).json({ message: '사용자를 찾을 수 없습니다.' });
      return;
    }

    console.log('스티커 업데이트 성공:', results);
    res.status(200).json({ message: '스티커 업데이트 성공' });
  });
});

app.get('/api/gamescore', (req, res) => {
  const userId = req.query.id;
  const gameName = req.query.game_name;
  const query = 'SELECT * FROM game_score WHERE id = ? AND game_name = ?';

  connection.query(query, [userId, gameName], (err, results, fields) => {
    if (err) {
      console.error('쿼리 실행 실패: ' + err.stack);
      res.status(500).json({ error: '데이터베이스 쿼리 실행 중 오류 발생' });
      return;
    }
    res.json(results);
  });
});

app.post('/api/gamescore', (req, res) => {
  const { id, game_name, score } = req.body;
  const query = 'INSERT INTO game_score (id, game_name, score) VALUES (?, ?, ?)';

  connection.query(query, [id, game_name, score], (error, results, fields) => {
    if (error) {
      console.error('데이터 삽입 실패:', error);
      res.status(500).json({ message: '데이터 삽입 실패' });
    } else {
      console.log('데이터 삽입 성공:', results);
      res.json({ message: '데이터 삽입 성공' });
    }
  });
});

app.get('/api/chatscore', (req, res) => {
  const userId = req.query.id;
  const npc = req.query.npc;
  const query = 'SELECT * FROM chat_score WHERE id = ? AND npc_name = ? AND map = ?';

  connection.query(query, [userId, npc], (err, results, fields) => {
    if (err) {
      console.error('쿼리 실행 실패: ' + err.stack);
      res.status(500).json({ error: '데이터베이스 쿼리 실행 중 오류 발생' });
      return;
    }
    res.json(results);
  });
});

app.post('/api/chatscore', (req, res) => {
  const { id, npc, map, score } = req.body;
  const query = 'INSERT INTO game_score (id, npc, map, score) VALUES (?, ?, ?, ?)';

  connection.query(query, [id, npc, map, score], (error, results, fields) => {
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
  if (connection && connection.end) {
    connection.end(err => {
      if (err) {
        console.error('연결 종료 중 에러 발생: ', err.stack);
      } else {
        console.log('데이터베이스 연결이 성공적으로 닫혔습니다.');
      }
      process.exit(0);
    });
  } else {
    process.exit(0);
  }
});
