Suwon AR6 PDF-based future climate-change Hazard indicator GeoTIFF set

This package follows the PDF indicator structure:
Hazard > 미래 기후변화 > 폭염일수(HW33), 열대야일수(TR25), 온난일 계속기간(WSDI).

Unlike the previous H126_ST/H245_MT-style outputs, these files are NOT PCA-combined Hazard rasters.
Each original climate indicator is stored separately.

Files:
- 27 raw indicator GeoTIFFs: 3 SSP scenarios x 3 periods x 3 indicators
- 27 normalized GeoTIFFs: same files with _z suffix
- ar6_pdf_hazard_indicator_catalog_100m.json
- ar6_pdf_hazard_indicator_summary_100m.csv

Scenarios: SSP126, SSP245, SSP370
Periods:
- ST = 2021-2040
- MT = 2041-2060
- LT = 2081-2100
Indicators:
- HW33 = 폭염일수, 33도 이상인 날의 수(연평균)
- TR25 = 열대야일수, 최저기온이 25도 이상인 날의 수(연평균)
- WSDI = 온난일 계속기간

Target grid:
- Suwon NGII B100 100m statistics grid
- CRS: EPSG:5179
- Raster size: 146 x 142
- Valid grid cells: 12487

Normalization:
- _z files are min-max normalized within valid Suwon 100m cells.
- Higher values mean higher Hazard.

Warning:
The uploaded AR6 gridraw files do not include coordinate headers. These outputs use the existing EPSG:5179 1km source-grid assumption from the previous conversion workflow. If official grid metadata/header is available, rebuild using that exact georeferencing.
