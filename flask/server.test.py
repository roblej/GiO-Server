from flask import Flask, request, jsonify
from flask_cors import CORS
import subprocess
import speech_recognition as sr
import os
import requests
import json
from dotenv import load_dotenv
import http.client

# 환경 변수 로드
load_dotenv()

app = Flask(__name__)
CORS(app)

# 클로바 API 키 환경 변수로 불러오기
CLOVA_API_KEY = os.getenv('CLOVA_API_KEY')
PRIMARY_API_KEY = os.getenv('PRIMARY_API_KEY')
REQUEST_ID = os.getenv('REQUEST_ID')

# 클로바 챗봇 기능 대체 클래스 정의
class CompletionExecutor:
    def __init__(self, host, api_key, api_key_primary_val, request_id):
        self._host = host
        self._api_key = api_key
        self._api_key_primary_val = api_key_primary_val
        self._request_id = request_id

    def _send_request(self, completion_request):
        headers = {
            'Content-Type': 'application/json; charset=utf-8',
            'X-NCP-CLOVASTUDIO-API-KEY': self._api_key,
            'X-NCP-APIGW-API-KEY': self._api_key_primary_val,
            'X-NCP-CLOVASTUDIO-REQUEST-ID': self._request_id
        }

        conn = http.client.HTTPSConnection(self._host)
        conn.request('POST', '/testapp/v1/tasks/stod5o4i/completions', json.dumps(completion_request), headers)
        response = conn.getresponse()
        result = json.loads(response.read().decode(encoding='utf-8'))
        conn.close()
        return result

    def execute(self, completion_request):
        res = self._send_request(completion_request)
        if res['status']['code'] == '20000':
            return res['result']['text']
        else:
            return 'Error'

# 클로바 챗봇 호출 함수 수정
def call_clova_chatbot(message):
    try:
        completion_executor = CompletionExecutor(
            host='clovastudio.apigw.ntruss.com',
            api_key=CLOVA_API_KEY,
            api_key_primary_val=PRIMARY_API_KEY,
            request_id=REQUEST_ID
        )

        request_data = {
            'text': message,
            'start': '',
            'restart': '',
            'includeTokens': True,
            'topP': 0.8,
            'topK': 0,
            'maxTokens': 100,
            'temperature': 0.5,
            'repeatPenalty': 5.0,
            'stopBefore': [],
            'includeAiFilters': True
        }

        response_text = completion_executor.execute(request_data)
        return response_text if response_text else "Error in response"

    except Exception as e:
        print(f"Error calling Clova API: {str(e)}")
        return None

# 1. 음성 인식 엔드포인트
@app.route('/')
def index():
    return "Flask 서버가 실행 중입니다. /recognize 경로로 POST 요청을 보내세요."

@app.route('/recognize', methods=['POST'])
def recognize():
    if 'file' not in request.files:
        return jsonify({'error': 'No file uploaded'}), 400

    audio_file = request.files['file']
    webm_path = "temp.webm"  # webm 파일 경로
    wav_path = "temp.wav"    # wav 파일 경로
    audio_file.save(webm_path)  # 임시 파일 저장

    # Convert to WAV using ffmpeg
    subprocess.run(['ffmpeg', '-i', webm_path, '-ar', '16000', '-ac', '1', wav_path], check=True)

    recognizer = sr.Recognizer()
    try:
        with sr.AudioFile(wav_path) as source:
            audio_data = recognizer.record(source)
        text = recognizer.recognize_google(audio_data, language="ko-KR")
        result = jsonify({'transcript': text})
    except (sr.UnknownValueError, sr.RequestError) as e:
        result = jsonify({'error': str(e)}), 500

    # 파일 삭제
    os.remove(webm_path)  # webm 파일 삭제
    os.remove(wav_path)   # wav 파일 삭제

    return result

# 2. 클로바 챗봇 API 호출 엔드포인트
@app.route('/clova', methods=['POST'])
def clova():
    try:
        data = request.get_json()

        if 'message' not in data:
            return jsonify({'error': 'No message provided'}), 400

        message = data['message']
        print(f"Received message: {message}")

        clova_response = call_clova_chatbot(message)

        if clova_response:
            return jsonify({'clova_response': clova_response})
        else:
            return jsonify({'error': 'Failed to get response from Clova API'}), 500

    except Exception as e:
        print(f"An error occurred: {str(e)}")
        return jsonify({'error': 'Internal Server Error'}), 500

if __name__ == '__main__':
    app.run(debug=True, host='0.0.0.0', port=5000)
