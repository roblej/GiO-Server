from flask import Flask, request, jsonify
from flask_cors import CORS
import subprocess
import speech_recognition as sr
import os
import requests
import json
from dotenv import load_dotenv

# 환경 변수 로드
load_dotenv()

app = Flask(__name__)
CORS(app)

# 클로바 API 키 환경 변수로 불러오기
CLOVA_API_KEY = os.getenv('CLOVA_API_KEY')
PRIMARY_API_KEY = os.getenv('PRIMARY_API_KEY')
REQUEST_ID = os.getenv('REQUEST_ID')

# 클로바 챗봇 API 호출 함수

def call_clova_chatbot(message):
    try:
        api_url = 'https://clovastudio.stream.ntruss.com/testapp/v1/chat-completions/HCX-DASH-001'
        headers = {
            'X-NCP-CLOVASTUDIO-API-KEY': CLOVA_API_KEY,
            'X-NCP-APIGW-API-KEY': PRIMARY_API_KEY,
            'X-NCP-CLOVASTUDIO-REQUEST-ID': REQUEST_ID,
            'Content-Type': 'application/json; charset=utf-8',
            'Accept': 'text/event-stream'
        }
        data = {
            'messages': [
                {"role": "system", "content": "너는 고기능 자폐아동의 사회성 학습 도우미야. 아이에게 올바른 사회성을 길러줘야해. 너는 아이와 대화 하는거야. 대화하는것처럼 말해아이들이 질문에 대한 적절한 답을 하지 못하면 정답을 알려주지는 말고, 아이가 고른 선택지가 왜 틀렸는지, 그 선택지는 어떤 상황에서 써야하는지 알려줘야해정답을 골랐다면 칭찬을 해줘야해."},
                {"role": "user", "content": message}
            ],
            'topP': 0.8,
            'topK': 0,
            'maxTokens': 256,
            'temperature': 0.5,
            'repeatPenalty': 5.0,
            'stopBefore': [],
            'includeAiFilters': True,
            'seed': 0
        }

        print(f"Sending request to Clova with data: {data}")
        response = requests.post(api_url, headers=headers, json=data, stream=True)

        print(f"Clova API response status code: {response.status_code}")

        if response.status_code != 200:
            print(f"Error in response: {response.text}")
            return None

        final_content = ""  # 최종 content 값을 저장할 변수

        # 이벤트 스트림 처리
        for line in response.iter_lines():
            if line:
                decoded_line = line.decode('utf-8')
                print(f"Received line: {decoded_line}")

                # JSON 데이터가 포함된 줄만 처리
                if 'data:' in decoded_line:
                    # 'data:' 뒤에 있는 JSON 파싱
                    data_str = decoded_line.split('data:', 1)[1]
                    try:
                        json_data = json.loads(data_str)

                        # 'event: result' 또는 최종 데이터에서 content 값을 추출
                        if 'message' in json_data and 'content' in json_data['message']:
                            final_content = json_data['message']['content']

                    except json.JSONDecodeError as e:
                        print(f"JSON decode error: {e}")

        if final_content:
            return final_content  # 최종 content만 반환
        else:
            print("No content received.")
            return None

    except requests.exceptions.RequestException as e:
        print(f"Error calling Clova API: {str(e)}")
        return None
    except ValueError as ve:
        print(f"JSON parsing error: {str(ve)}")
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
            # 클로바 API에서 content만 추출하여 반환
            return jsonify({'clova_response': clova_response})
        else:
            return jsonify({'error': 'Failed to get response from Clova API'}), 500

    except Exception as e:
        print(f"An error occurred: {str(e)}")
        return jsonify({'error': 'Internal Server Error'}), 500



if __name__ == '__main__':
    app.run(debug=True, host='0.0.0.0', port=5002)

