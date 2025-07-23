/**
 * @description       : 메인 컨테이너
 * 
 * @Method :
 *  - connectedCallback() : 컴포넌트 초기화 및 부서/비용 타입 옵션 로드
 *  - handleEventDrop(event) : 드래그 드롭으로 새 이벤트 생성
 *  - handleEventClick(event) : 기존 이벤트 클릭시 상세 정보 조회
 *  - handleEventMoved() : 이벤트 이동완료 후 성공처리
 *  - handleEventError(event) : 이벤트 에러발생시 에러 메시지 표시
 *  - handleDatesSet(event) : 달력 범위 변경, 비용 업데이트
 *  - handleInputChange(event) : 기본 입력 필드 변경 처리
 *  - handleCostChange(event) : 비용 입력 변경 처리
 *  - addCostItem() : 새 비용 항목 추가
 *  - openModal() : 모달 열기
 *  - closeModal() : 모달 닫기
 *  - resetModal() : 모달 초기화
 *  - saveEvent() : 이벤트 및 비용 정보 저장
 *  - handleDelete() : 이벤트 삭제
 *  - toLocalYMD(date) : 날짜 YYYY-MM-DD형식으로 변환
 *  - addOneDay(ymdStr) : 날짜 문자열 +1일
 *  - updateCalendarView(savedEventId) : 캘린더 뷰에 이벤트 반영
 *  - refreshCostSummary() : 비용요약 패널 새로고침
 *  - showToast(title, message, variant) : 토스트 메시지 표시
 * 
 * @author            : sejin.park@dkbmc.com
 * @group             : 
 * @last modified on  : 2025-07-23
 * @last modified by  : sejin.park@dkbmc.com
**/
import { LightningElement, track } from 'lwc';
import { ShowToastEvent } from 'lightning/platformShowToastEvent';

// apex 메소드
import saveEventAndCosts from '@salesforce/apex/CalendarAppController.saveEventAndCosts';
import getEventDetails from '@salesforce/apex/CalendarAppController.getEventDetails';
import deleteEvent from '@salesforce/apex/CalendarAppController.deleteEvent';
import getDepartmentOptions from '@salesforce/apex/CalendarAppController.getDepartmentOptions';
import getCostTypeOptions from '@salesforce/apex/CalendarAppController.getCostTypeOptions';

export default class CalendarContainer extends LightningElement {
    @track isModalOpen = false;
    @track modalTitle = '';
    @track currentMonthForSummary = new Date().toISOString();
    @track recordId = null;
    @track eventTitle = '';
    @track eventStartDate = '';
    @track eventEndDate = '';
    @track eventDescription = '';
    @track eventLocation = '';
    @track eventDepartment = '';
    @track costItems = [{ id: 0, type: '', amount: null }];
    @track newEventData = { extendedProps: {} };

    @track departmentPicklistOptions = [];
    @track costTypePicklistOptions = [];

    // --생명주기 메소드--
    // 컴포넌트 초기화 및 부서/비용 타입 옵션 로드
    async connectedCallback() {
        try {
            const deptOptions = await getDepartmentOptions();
            const costOptions = await getCostTypeOptions();
            
            this.departmentPicklistOptions = deptOptions || [];
            this.costTypePicklistOptions = costOptions || [];
        } catch (error) {
            console.error('부서/비용 옵션 조회 오류:', error);
            this.showToast('오류', '설정 옵션을 불러오는데 실패했습니다.', 'error');
        }
    }

    // --Getters--
    // 좌측패널 이벤트 판단
    get isSalesforceObjectEvent() {
        return this.newEventData?.extendedProps?.recordType !== 'Personal';
    }

    get isPersonalActivityEvent() {
        return !this.isSalesforceObjectEvent;
    }

    // Salesforce 객체 타입 판단
    get isAccountType() {
        return this.newEventData?.extendedProps?.recordType === 'Account';
    }

    get isContactType() {
        return this.newEventData?.extendedProps?.recordType === 'Contact';
    }

    get isOpportunityType() {
        return this.newEventData?.extendedProps?.recordType === 'Opportunity';
    }

    // 관련 레코드명 표시용
    get displayRelatedRecord() {
        const recordType = this.newEventData?.extendedProps?.recordType;
        
        if (recordType === 'Account') {
            return this.newEventData?.extendedProps?.accountName || '';
        } else if (recordType === 'Contact') {
            return this.newEventData?.extendedProps?.contactName || '';
        } else if (recordType === 'Opportunity') {
            return this.newEventData?.extendedProps?.opportunityName || '';
        }
        
        return '';
    }

    // 부서 옵션 반환
    get departmentOptions() { 
        return this.departmentPicklistOptions || []; 
    }
    
    // 비용 타입 옵션 반환
    get costTypeOptions() { 
        return this.costTypePicklistOptions || []; 
    }

    // 이벤트 처리 메소드
    // 드래그 드롭으로 새 이벤트 생성
    handleEventDrop(event) {
        try {
            const { draggedEl, date } = event.detail;
            const { recordName, recordType, recordId, accountName } = draggedEl?.dataset || {};
            
            if (!recordName) {
                console.warn('드롭된 요소에 recordName이 없습니다.');
                return;
            }

            this.resetModal();
            this.eventTitle = recordName;
            this.eventDepartment = this.departmentPicklistOptions[0]?.value || '';
            this.eventStartDate = this.eventEndDate = this.toLocalYMD(date);
            
            this.newEventData = {
                extendedProps: { 
                    recordType, 
                    relatedId: recordId || '', 
                    accountName: recordType === 'Account' ? recordName : (accountName || ''),
                    contactName: recordType === 'Contact' ? recordName : '',
                    opportunityName: recordType === 'Opportunity' ? recordName : ''
                }
            };
            this.modalTitle = `새 ${recordType === 'Personal' ? '활동' : '이벤트'}: ${recordName}`;
            this.openModal();
        } catch (error) {
            console.error('이벤트 드롭 처리 오류:', error);
            this.showToast('오류', '이벤트 생성 중 오류가 발생했습니다.', 'error');
        }
    }

    // 기존 이벤트 클릭시 상세 정보 조회
    async handleEventClick(event) {
        try {
            const eventId = event.detail?.eventId;
            if (!eventId) {
                console.warn('클릭된 이벤트에 ID가 없습니다.');
                return;
            }

            const result = await getEventDetails({ eventId });
            
            if (!result || !result.event) {
                throw new Error('이벤트 데이터를 가져올 수 없습니다.');
            }

            const evt = result.event;
            const costs = result.costs || [];
            
            this.recordId = eventId;
            this.eventTitle = evt.Title__c || '';
            this.eventStartDate = evt.Start_Date__c || '';
            this.eventEndDate = evt.End_Date__c || '';
            this.eventDescription = evt.Description__c || '';
            this.eventLocation = evt.Location__c || '';
            this.eventDepartment = costs[0]?.department__c || this.departmentPicklistOptions[0]?.value || '';

            const recordType = evt.Related_Record_Type__c || '';
            const relatedRecordName = result.relatedRecordName || '';
            
            this.newEventData = {
                extendedProps: {
                    recordType: recordType,
                    relatedId: evt.Related_Record_Id__c || '',
                    accountName: recordType === 'Account' ? relatedRecordName : '',
                    contactName: recordType === 'Contact' ? relatedRecordName : '',
                    opportunityName: recordType === 'Opportunity' ? relatedRecordName : ''
                }
            };

            if (costs.length > 0) {
                this.costItems = costs.map((c, i) => ({
                    id: i,
                    type: c.Cost_Type__c || '',
                    amount: c.Amount__c || null
                }));
            } else {
                this.costItems = [{ id: 0, type: '', amount: null }];
            }

            this.modalTitle = `이벤트 수정: ${evt.Title__c || 'Untitled'}`;
            this.openModal();

        } catch (error) {
            console.error('이벤트 상세 조회 오류:', error);
            this.showToast('오류', '이벤트 정보를 불러오는데 실패했습니다.', 'error');
        }
    }

    // 이벤트 이동완료 후 성공처리
    handleEventMoved() {
        try {
            this.showToast('성공', '이벤트가 이동되었습니다', 'success');
            this.refreshCostSummary();
        } catch (error) {
            console.error('이벤트 이동 후 처리 오류:', error);
        }
    }

    // 이벤트 에러발생시 에러 메시지 표시
    handleEventError(event) {
        try {
            const message = event.detail?.message || '알 수 없는 오류가 발생했습니다';
            this.showToast('오류', message, 'error');
        } catch (error) {
            console.error('이벤트 에러 핸들링 오류:', error);
            this.showToast('오류', '처리 중 오류가 발생했습니다', 'error');
        }
    }

    // 달력 범위 변경, 비용 업데이트
    handleDatesSet(event) {
        try {
            const { start, end } = event.detail;
            if (!start || !end) {
                console.warn('날짜 설정 이벤트에 필요한 데이터가 없습니다.');
                return;
            }

            const mid = new Date((new Date(start).getTime() + new Date(end).getTime()) / 2);
            this.currentMonthForSummary = mid.toISOString();
            this.refreshCostSummary();
        } catch (error) {
            console.error('날짜 설정 처리 오류:', error);
        }
    }

    // --입력 처리 메소드--
    // 기본 입력 필드 변경 처리
    handleInputChange(event) {
        try {
            const { name, value } = event.target;
            
            const allowedFields = [
                'eventTitle', 'eventStartDate', 'eventEndDate', 
                'eventDescription', 'eventLocation', 'eventDepartment'
            ];
            
            if (name && allowedFields.includes(name)) {
                this[name] = value || '';
            }
        } catch (error) {
            console.error('입력 변경 처리 오류:', error);
        }
    }

    // 비용 입력 변경 처리
    handleCostChange(event) {
        try {
            const { name, value } = event.target;
            const itemId = parseInt(event.target.dataset.id, 10);
            
            if (isNaN(itemId) || !name) {
                console.warn('비용 변경 이벤트에 필요한 데이터가 없습니다.');
                return;
            }

            this.costItems = this.costItems.map(item =>
                (item.id === itemId ? { ...item, [name]: value } : item)
            );
        } catch (error) {
            console.error('비용 변경 처리 오류:', error);
        }
    }

    // 새 비용 항목 추가
    addCostItem() {
        try {
            this.costItems = [...this.costItems, { 
                id: this.costItems.length, 
                type: '', 
                amount: null 
            }];
        } catch (error) {
            console.error('비용 항목 추가 오류:', error);
            this.showToast('오류', '비용 항목 추가 중 오류가 발생했습니다.', 'error');
        }
    }

    // --모달 관리 메소드--
    openModal() { 
        this.isModalOpen = true; 
    }
    
    closeModal() {
        try {
            this.isModalOpen = false;
            this.resetModal();
        } catch (error) {
            console.error('모달 닫기 오류:', error);
        }
    }

    resetModal() {
        try {
            this.recordId = null;
            this.eventTitle = '';
            this.eventStartDate = '';
            this.eventEndDate = '';
            this.eventDescription = '';
            this.eventLocation = '';
            this.eventDepartment = '';
            this.costItems = [{ id: 0, type: '', amount: null }];
            this.newEventData = { extendedProps: {} };
        } catch (error) {
            console.error('모달 리셋 오류:', error);
        }
    }

    // --데이터 저장,삭제 메소드--
    async saveEvent() {
        try {
            if (!this.eventTitle?.trim()) {
                this.showToast('입력 오류', '제목을 입력해주세요', 'error');
                return;
            }

            // 이벤트 기본 정보를 JSON으로 구성
            const eventData = {
                recordId: this.recordId,
                title: this.eventTitle,
                startDate: this.eventStartDate,
                endDate: this.eventEndDate,
                description: this.eventDescription,
                location: this.eventLocation,
                department: this.eventDepartment,
                relatedId: this.newEventData?.extendedProps?.relatedId || '',
                recordType: this.newEventData?.extendedProps?.recordType || ''
            };

            // 비용 데이터 필터링 및 구성
            const costData = this.costItems
                .filter(item => item?.type && Number(item.amount) > 0)
                .map(item => ({ type: item.type, amount: Number(item.amount) }));

            const savedEventId = await saveEventAndCosts({
                eventDataJson: JSON.stringify(eventData),
                costDetailsJson: JSON.stringify(costData)
            });

            this.updateCalendarView(savedEventId);
            this.showToast('성공', '저장되었습니다', 'success');
            this.closeModal();
            this.refreshCostSummary();

        } catch (error) {
            console.error('이벤트 저장 오류:', error);
            const msg = error?.body?.message || error?.message || '저장 실패';
            this.showToast('저장 오류', msg, 'error');
        }
    }

    async handleDelete() {
        try {
            if (!this.recordId) {
                console.warn('삭제할 이벤트 ID가 없습니다.');
                return;
            }

            await deleteEvent({ eventId: this.recordId });
            
            this.template.querySelector('c-calendar-view')?.removeEvent(this.recordId);
            this.showToast('성공', '삭제되었습니다', 'success');
            this.closeModal();
            this.refreshCostSummary();

        } catch (error) {
            console.error('이벤트 삭제 오류:', error);
            const msg = error?.body?.message || error?.message || '삭제 실패';
            this.showToast('삭제 오류', msg, 'error');
        }
    }

    // --유틸리티 메소드--
    // 날짜 YYYY-MM-DD형식으로 변환
    toLocalYMD(date) {
        try {
            if (!date) {
                return '';
            }
            return new Date(date.getTime() - (date.getTimezoneOffset() * 60000))
                .toISOString().slice(0, 10);
        } catch (error) {
            console.error('날짜 변환 오류:', error);
            return '';
        }
    }

    // 날짜 문자열 +1
    addOneDay(ymdStr) {
        try {
            if (!ymdStr) {
                return ymdStr;
            }
            const date = new Date(ymdStr);
            date.setDate(date.getDate() + 1);
            return date.toISOString().slice(0, 10);
        } catch (error) {
            console.error('날짜 하루 추가 오류:', error);
            return ymdStr;
        }
    }

    // 캘린더 뷰에 이벤트 반영
    updateCalendarView(savedEventId) {
        try {
            const calendarView = this.template.querySelector('c-calendar-view');
            if (!calendarView) {
                console.warn('캘린더 뷰 컴포넌트를 찾을 수 없습니다.');
                return;
            }

            const eventData = {
                title: this.eventTitle || 'Untitled Event',
                start: this.eventStartDate || '',
                end: this.addOneDay(this.eventEndDate || this.eventStartDate || ''),
                allDay: true
            };

            if (this.recordId) {
                calendarView.updateEvent(this.recordId, eventData);
            } else if (savedEventId) {
                calendarView.addEvent({ id: savedEventId, ...eventData });
            }
        } catch (error) {
            console.error('캘린더 뷰 업데이트 오류:', error);
        }
    }

    // 비용요약 패널 새로고침
    refreshCostSummary() {
        try {
            const panel = this.template.querySelector('c-cost-summary-panel');
            if (panel) {
                panel.updateMonth(this.currentMonthForSummary);
                panel.refreshSummary();
            }
        } catch (error) {
            console.error('비용 요약 새로고침 오류:', error);
        }
    }

    // 토스트 메시지
    showToast(title, message, variant) {
        try {
            this.dispatchEvent(new ShowToastEvent({ title, message, variant }));
        } catch (error) {
            console.error('토스트 메시지 표시 오류:', error);
        }
    }
}