# VWorld Data API 프록시

GitHub Pages는 정적 호스팅이라 브라우저에서 VWorld Data API를 직접 호출하면 CORS 정책에 막힐 수 있습니다. WMS 지도 이미지는 표시될 수 있지만, 연속지적도 필지 후보 도출처럼 JSON을 받아야 하는 Data API는 서버측에서 VWorld 키를 붙여 호출하고 CORS 허용 응답을 돌려주는 작은 프록시가 필요합니다.

## Supabase Edge Function

이 저장소에는 Supabase Edge Function으로 배포할 수 있는 프록시가 포함되어 있습니다.

```text
supabase/functions/vworld-data/index.ts
```

Supabase CLI에서 배포합니다.

```powershell
supabase functions deploy vworld-data
supabase secrets set VWORLD_API_KEY=F2BE7753-45CF-308D-BFFD-BB85E75F2DF5
supabase secrets set VWORLD_DOMAIN=https://istel90.github.io/LivingLabs/
```

GitHub 저장소 Secret으로 다른 프록시 URL을 쓰고 싶다면 아래 값을 추가합니다.

```text
VWORLD_PROXY_URL=https://<project-ref>.supabase.co/functions/v1/vworld-data
```

현재 GitHub Pages 배포 워크플로우에는 `https://ehjygntjhqkddtcnvjdj.supabase.co/functions/v1/vworld-data`가 기본 프록시 URL로 들어가 있습니다. Secret `VWORLD_PROXY_URL`을 설정하면 그 값이 우선 적용됩니다.

다음 GitHub Pages 배포부터 앱은 프록시 URL을 통해 실제 VWorld Data API 응답을 받습니다. 필지 후보 도출에는 샘플 fallback 데이터를 사용하지 않습니다.

## 빠른 테스트

프록시 배포 후 아래 URL을 열어 확인합니다.

```text
https://<project-ref>.supabase.co/functions/v1/vworld-data?data=LP_PA_CBND_BUBUN&geomFilter=BOX(127.000,37.250,127.010,37.260)&size=1&page=1
```

정상 응답 예시는 다음과 같습니다.

```json
{
  "response": {
    "status": "OK"
  }
}
```
