import * as api from './api';
import { mockRisks, mockDepartments, mockResponses } from '../data/mockData';

export async function seedDatabase() {
  try {
    console.log('Starting database seed...');

    // Check if risks already exist and if they need department assignments
    let shouldSeedRisks = true;
    let shouldUpdateAssignments = false;
    try {
      const existingRisks = await api.getRisks();
      if (existingRisks && existingRisks.length > 0) {
        // Check if risks have department assignments
        const risksWithoutAssignments = existingRisks.filter((r: any) =>
          !r.assignedDepartmentIds || r.assignedDepartmentIds.length === 0
        );

        if (risksWithoutAssignments.length > 0) {
          console.log(`Found ${risksWithoutAssignments.length} risks without department assignments, will update.`);
          shouldUpdateAssignments = true;
          shouldSeedRisks = false;
        } else {
          console.log('Risks already exist with assignments, skipping risk seed.');
          shouldSeedRisks = false;
        }
      }
    } catch (error) {
      console.log('Could not check existing risks, proceeding with seed...');
    }

    // Check if responses already exist
    let shouldSeedResponses = true;
    try {
      const existingResponses = await api.getResponses();
      if (existingResponses && existingResponses.length > 0) {
        console.log('Responses already exist, skipping response seed.');
        shouldSeedResponses = false;
      }
    } catch (error) {
      console.log('Could not check existing responses, proceeding with seed...');
    }

    if (!shouldSeedRisks && !shouldSeedResponses && !shouldUpdateAssignments) {
      console.log('All data already exists, skipping seed.');
      return;
    }

    // Update existing risks with department assignments
    if (shouldUpdateAssignments) {
      console.log('Updating existing risks with department assignments...');
      const existingRisks = await api.getRisks();

      for (const existingRisk of existingRisks) {
        if (existingRisk.assignedDepartmentIds && existingRisk.assignedDepartmentIds.length > 0) {
          continue; // Skip if already has assignments
        }

        // Assign departments based on risk sector
        let assignedDepartments: string[] = [];
        const sector = existingRisk.sectorName || existingRisk.sector || '';

        if (sector === '건강') {
          assignedDepartments = ['건강증진과', '보건정책과', '기후변화대응팀'];
        } else if (sector === '생태계/산림') {
          assignedDepartments = ['산림녹지과', '기후변화대응팀'];
        } else if (sector === '물관리') {
          assignedDepartments = ['하천관리과', '재난안전과', '기후변화대응팀'];
        } else if (sector === '연안') {
          assignedDepartments = ['재난안전과', '기후대응과'];
        } else if (sector === '국토') {
          assignedDepartments = ['도시계획과', '재난안전과'];
        } else {
          assignedDepartments = ['기후대응과', '기후변화대응팀'];
        }

        try {
          await api.updateRisk(existingRisk.id, {
            ...existingRisk,
            assignedDepartmentIds: assignedDepartments,
            updatedAt: new Date().toISOString(),
          });
          console.log(`Updated risk ${existingRisk.id} with departments: ${assignedDepartments.join(', ')}`);
        } catch (error) {
          console.error(`Failed to update risk ${existingRisk.id}:`, error);
        }
      }
    }

    if (shouldSeedRisks) {
      // Seed departments
      console.log('Seeding departments...');
      for (const dept of mockDepartments) {
        try {
          await api.createDepartment(dept);
        } catch (error) {
          console.error(`Failed to create department ${dept.name}:`, error);
        }
      }

      // Seed risks
      console.log('Seeding risks...');
      for (const risk of mockRisks) {
        try {
          // Assign departments based on risk sector
          let assignedDepartments: string[] = [];

          if (risk.sector === '건강') {
            assignedDepartments = ['건강증진과', '보건정책과', '기후변화대응팀'];
          } else if (risk.sector === '생태계/산림') {
            assignedDepartments = ['산림녹지과', '기후변화대응팀'];
          } else if (risk.sector === '물관리') {
            assignedDepartments = ['하천관리과', '재난안전과', '기후변화대응팀'];
          } else if (risk.sector === '연안') {
            assignedDepartments = ['재난안전과', '기후대응과'];
          } else if (risk.sector === '국토') {
            assignedDepartments = ['도시계획과', '재난안전과'];
          } else {
            assignedDepartments = ['기후대응과', '기후변화대응팀'];
          }

          // Map old structure to new unified Risk type
          await api.createRisk({
            id: risk.id,
            projectId: 'default',
            municipality: '인천광역시',
            title: risk.name,
            description: risk.description,
            sectorId: '',
            sectorName: risk.sector,
            subsectorId: '',
            subsectorName: risk.subSector,
            detailTagId: '',
            detailTagName: risk.subSubTag || '',
            respondentGuide: '',
            overview: {
              summary: '',
              expectedImpact: '',
              relatedClimateHazard: '',
            },
            contextInfo: {
              title: '',
              body: '',
              keyPoints: [],
              blocks: [],
              source: '',
            },
            mapInfo: {
              center: [37.4563, 126.7052],
              zoom: 11,
              baseLayer: 'osm',
              visibleLayers: [],
              markers: [],
            },
            assignedDepartmentIds: assignedDepartments,
            status: risk.status === 'completed' || risk.status === 'confirmed' ? 'confirmed' : risk.status === 'in-progress' ? 'review_requested' : 'draft',
            dueDate: '2026-04-30',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          });
        } catch (error) {
          console.error(`Failed to create risk ${risk.name}:`, error);
        }
      }
    }

    if (shouldSeedResponses) {
      // Seed responses
      console.log('Seeding responses...');
      for (const response of mockResponses) {
        try {
          await api.createResponse({
            id: response.id,
            projectId: 'default',
            riskId: response.riskId,
            userId: response.userId || '',
            departmentId: response.department,
            answers: [
              { questionId: 'q1_type', value: response.question1Type, label: '리스크 유형' },
              { questionId: 'q1_urgency', value: response.question1Urgency, label: '우선순위' },
              { questionId: 'q2', value: response.question2Answers.join(', '), label: '영향 지역' },
              { questionId: 'q3_short', value: response.question3Short, label: '단기 전망' },
              { questionId: 'q3_long', value: response.question3Long, label: '장기 전망' },
            ],
            status: 'submitted',
            submittedAt: response.submittedAt,
            updatedAt: response.submittedAt,
          });
        } catch (error) {
          console.error(`Failed to create response for ${response.respondent}:`, error);
        }
      }
    }

    console.log('Database seeded successfully!');
  } catch (error) {
    console.error('Failed to seed database:', error);
    // Don't throw - allow app to continue with mock data
  }
}
