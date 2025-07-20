/**
 * @description       : 캘린더 컨테이너 (Script Exception 수정 버전)
 * @author            : sejin.park@dkbmc.com
 */
import { LightningElement, track } from 'lwc';
import { ShowToastEvent } from 'lightning/platformShowToastEvent';

// Custom Labels import
import LABEL_INPUT_ERROR from '@salesforce/label/c.LABEL_INPUT_ERROR';
import LABEL_REQUIRED_TITLE from '@salesforce/label/c.LABEL_REQUIRED_TITLE';
import LABEL_SUCCESS_SAVE from '@salesforce/label/c.LABEL_SUCCESS_SAVE';
import LABEL_EVENT_SAVED from '@salesforce/label/c.LABEL_EVENT_SAVED';
import LABEL_SAVE_ERROR from '@salesforce/label/c.LABEL_SAVE_ERROR';
import LABEL_SUCCESS_DELETE from '@salesforce/label/c.LABEL_SUCCESS_DELETE';

// Apex Methods - 새로운 메서드 구조 사용
import saveEventAndCosts from '@salesforce/apex/CalendarAppController.saveEventAndCosts';
import getEventDetails from '@salesforce/apex/CalendarAppController.getEventDetails';
import deleteEvent from '@salesforce/apex/CalendarAppController.deleteEvent';
import getDepartmentOptions from '@salesforce/apex/CalendarAppController.getDepartmentOptions';
import getCostTypeOptions from '@salesforce/apex/CalendarAppController.getCostTypeOptions';

// === 상수 정의 ===
const RECORD_TYPES = {
    PERSONAL: 'Personal',
    ACCOUNT: 'Account',
    CONTACT: 'Contact',
    OPPORTUNITY: 'Opportunity'
};

const ERROR_MESSAGES = {
    INVALID_DROP_DATA: '드롭 이벤트 데이터가 유효하지 않습니다.',
    INVALID_DRAG_DATA: '드래그된 항목의 데이터가 유효하지 않습니다.',
    LOAD_OPTIONS_ERROR: '옵션을 불러오는 데 실패했습니다.',
    LOAD_EVENT_ERROR: '이벤트 정보를 불러오는 데 실패했습니다.'
};

// === 유틸리티 함수 ===
function addOneDay(ymdStr) {
    try {
        if (!ymdStr) return '';
        const date = new Date(ymdStr);
        date.setDate(date.getDate() + 1);
        return date.toISOString().slice(0, 10);
    } catch (e) {
        console.error('addOneDay 오류:', e);
        return ymdStr;
    }
}

function toLocalYMD(date) {
    try {
        if (!date) return '';
        const localDate = new Date(date.getTime() - (date.getTimezoneOffset() * 60000));
        return localDate.toISOString().slice(0, 10);
    } catch (e) {
        console.error('toLocalYMD 오류:', e);
        return '';
    }
}

// 안전한 JSON 파싱
function safeJSONStringify(obj) {
    try {
        return JSON.stringify(obj || []);
    } catch (e) {
        console.error('JSON stringify 오류:', e);
        return '[]';
    }
}

export default class CalendarContainer extends LightningElement {
    // === 상태 관리 ===
    @track isModalOpen = false;
    @track modalTitle = '';
    @track currentMonthForSummary;

    // === 이벤트 데이터 ===
    @track recordId = null;
    @track eventTitle = '';
    @track eventStartDate = '';
    @track eventEndDate = '';
    @track eventDescription = '';
    @track eventLocation = '';
    @track eventDepartment = '';
    @track costItems = [];
    @track newEventData = { extendedProps: {} };

    // === 피클리스트 옵션 ===
    @track departmentPicklistOptions = [];
    @track costTypePicklistOptions = [];

    // === Computed Properties ===
    get isSalesforceObjectEvent() {
        try {
            return this.newEventData?.extendedProps?.recordType !== RECORD_TYPES.PERSONAL;
        } catch (e) {
            console.error('isSalesforceObjectEvent 오류:', e);
            return false;
        }
    }

    get isPersonalActivityEvent() {
        try {
            return this.newEventData?.extendedProps?.recordType === RECORD_TYPES.PERSONAL;
        } catch (e) {
            console.error('isPersonalActivityEvent 오류:', e);
            return false;
        }
    }

    get displayAccountName() {
        try {
            return this.newEventData?.extendedProps?.accountName || '';
        } catch (e) {
            console.error('displayAccountName 오류:', e);
            return '';
        }
    }

    get departmentOptions() {
        return this.departmentPicklistOptions || [];
    }

    get costTypeOptions() {
        return this.costTypePicklistOptions || [];
    }

    // === 라이프사이클 ===
    connectedCallback() {
        try {
            const today = new Date();
            this.currentMonthForSummary = today.toISOString();
            this.loadPicklistOptions();
        } catch (e) {
            console.error('connectedCallback 오류:', e);
        }
    }

    // === 피클리스트 로드 ===
    loadPicklistOptions() {
        Promise.all([getDepartmentOptions(), getCostTypeOptions()])
            .then(([departmentOptions, costTypeOptions]) => {
                this.departmentPicklistOptions = departmentOptions || [];
                this.costTypePicklistOptions = costTypeOptions || [];
            })
            .catch(error => {
                console.error('피클리스트 로드 오류:', error);
                this.showToast('오류', ERROR_MESSAGES.LOAD_OPTIONS_ERROR, 'error');
            });
    }

    // === 이벤트 드롭 처리 ===
    handleEventDrop(event) {
        try {
            const eventDetail = event.detail || {};
            const { draggedEl, date } = eventDetail;
            
            if (!draggedEl || !date) {
                throw new Error(ERROR_MESSAGES.INVALID_DROP_DATA);
            }

            const dataset = draggedEl.dataset || {};
            const { recordName, recordType, recordId, accountName } = dataset;
            
            if (!recordName || !recordType) {
                throw new Error(ERROR_MESSAGES.INVALID_DRAG_DATA);
            }

            this.recordId = null;
            this.eventTitle = recordName || '';
            this.eventDepartment = (this.departmentPicklistOptions[0]?.value) || '';
            this.eventDescription = '';
            this.eventLocation = '';

            const localYMD = toLocalYMD(date);
            this.eventStartDate = localYMD;
            this.eventEndDate = localYMD;

            this.newEventData = {
                extendedProps: { 
                    recordType: recordType || '', 
                    relatedId: recordId || '', 
                    accountName: accountName || '' 
                }
            };

            this.costItems = [{ id: 0, type: '', amount: null }];
            this.modalTitle = `새 ${recordType === RECORD_TYPES.PERSONAL ? '활동' : '이벤트'}: ${recordName}`;
            this.openModal();
        } catch (error) {
            console.error('이벤트 드롭 처리 오류:', error);
            this.showToast('오류', error.message || '드롭 처리 중 오류가 발생했습니다', 'error');
        }
    }

    // === 기존 이벤트 클릭 처리 ===
    handleEventClick(event) {
        try {
            const eventDetail = event.detail || {};
            this.recordId = eventDetail.eventId;
            
            if (!this.recordId) {
                console.warn('이벤트 ID가 없습니다');
                return;
            }

            getEventDetails({ eventId: this.recordId })
                .then(result => {
                    if (!result || !result.event) {
                        throw new Error('이벤트 데이터를 찾을 수 없습니다');
                    }

                    const evt = result.event;
                    
                    this.eventTitle = evt.Title__c || '';
                    this.eventStartDate = evt.Start_Date__c || '';
                    this.eventEndDate = evt.End_Date__c || '';
                    this.eventDescription = evt.Description__c || '';
                    this.eventLocation = evt.Location__c || '';
                    
                    // 부서 정보 안전하게 가져오기
                    const costs = result.costs || [];
                    this.eventDepartment = (costs.length > 0 && costs[0].department__c) || 
                                         (this.departmentPicklistOptions[0]?.value) || '';

                    this.newEventData = {
                        extendedProps: {
                            recordType: evt.Related_Record_Type__c || '',
                            relatedId: evt.Related_Record_Id__c || '',
                            accountName: result.accountName || ''
                        }
                    };

                    // 비용 아이템 안전하게 처리
                    this.costItems = costs.length > 0
                        ? costs.map((c, i) => ({ 
                            id: i, 
                            type: c.Cost_Type__c || '', 
                            amount: c.Amount__c || null 
                          }))
                        : [{ id: 0, type: '', amount: null }];

                    this.modalTitle = `이벤트 수정: ${evt.Title__c || 'Untitled'}`;
                    this.openModal();
                })
                .catch(error => {
                    console.error('이벤트 상세 조회 오류:', error);
                    this.showToast('오류', ERROR_MESSAGES.LOAD_EVENT_ERROR, 'error');
                });
        } catch (error) {
            console.error('이벤트 클릭 처리 오류:', error);
            this.showToast('오류', '이벤트 클릭 처리 중 오류가 발생했습니다', 'error');
        }
    }

    // === 이벤트 저장 (안전성 강화) ===
    saveEvent() {
        try {
            if (!this.eventTitle || this.eventTitle.trim() === '') {
                this.showToast(LABEL_INPUT_ERROR, LABEL_REQUIRED_TITLE, 'error');
                return;
            }

            // 비용 데이터 안전하게 필터링
            const costData = (this.costItems || [])
                .filter(item => {
                    try {
                        return item && 
                               item.type && 
                               item.amount !== null && 
                               item.amount !== undefined && 
                               Number(item.amount) > 0;
                    } catch (e) {
                        console.warn('비용 아이템 필터링 오류:', e, item);
                        return false;
                    }
                })
                .map(item => ({ 
                    type: item.type, 
                    amount: Number(item.amount) 
                }));

            // 개별 파라미터로 전달
            const saveParams = {
                recordId: this.recordId,
                title: this.eventTitle || '',
                startDate: this.eventStartDate || '',
                endDate: this.eventEndDate || '',
                description: this.eventDescription || '',
                location: this.eventLocation || '',
                department: this.eventDepartment || '',
                relatedId: this.newEventData?.extendedProps?.relatedId || '',
                recordType: this.newEventData?.extendedProps?.recordType || '',
                costDetailsJson: safeJSONStringify(costData)
            };

            console.log('저장 파라미터:', saveParams);

            saveEventAndCosts(saveParams)
                .then(savedEventId => {
                    if (savedEventId) {
                        this.updateCalendarView(savedEventId);
                        this.showToast(LABEL_SUCCESS_SAVE, LABEL_EVENT_SAVED, 'success');
                        this.closeModal();
                        this.refreshCostSummary();
                    } else {
                        throw new Error('이벤트 ID가 반환되지 않았습니다');
                    }
                })
                .catch(error => {
                    console.error('이벤트 저장 오류:', error);
                    const errorMessage = error?.body?.message || error?.message || '이벤트 저장 중 오류가 발생했습니다.';
                    this.showToast(LABEL_SAVE_ERROR, errorMessage, 'error');
                });
        } catch (error) {
            console.error('saveEvent 메서드 오류:', error);
            this.showToast(LABEL_SAVE_ERROR, '저장 처리 중 오류가 발생했습니다', 'error');
        }
    }

    // === 이벤트 삭제 ===
    handleDelete() {
        try {
            if (!this.recordId) {
                console.warn('삭제할 이벤트 ID가 없습니다');
                return;
            }

            deleteEvent({ eventId: this.recordId })
                .then(() => {
                    const calendarView = this.template.querySelector('c-calendar-view');
                    if (calendarView) {
                        calendarView.removeEvent(this.recordId);
                    }
                    this.showToast(LABEL_SUCCESS_SAVE, LABEL_SUCCESS_DELETE, 'success');
                    this.closeModal();
                    this.refreshCostSummary();
                })
                .catch(error => {
                    console.error('이벤트 삭제 오류:', error);
                    const errorMessage = error?.body?.message || error?.message || '일정 삭제 중 오류가 발생했습니다.';
                    this.showToast('삭제 오류', errorMessage, 'error');
                });
        } catch (error) {
            console.error('handleDelete 메서드 오류:', error);
            this.showToast('삭제 오류', '삭제 처리 중 오류가 발생했습니다', 'error');
        }
    }

    // === 기타 이벤트 핸들러들 ===
    handleEventMoved(event) {
        try {
            const eventDetail = event.detail || {};
            this.showToast('성공', eventDetail.message || '이벤트가 이동되었습니다', 'success');
            this.refreshCostSummary();
        } catch (error) {
            console.error('이벤트 이동 처리 오류:', error);
        }
    }

    handleEventError(event) {
        try {
            const eventDetail = event.detail || {};
            this.showToast('오류', eventDetail.message || '오류가 발생했습니다', 'error');
        } catch (error) {
            console.error('이벤트 오류 처리 오류:', error);
        }
    }

    handleDatesSet(event) {
        try {
            const eventDetail = event.detail || {};
            const startDate = new Date(eventDetail.start);
            const endDate = new Date(eventDetail.end);
            const viewMiddle = new Date(startDate.getTime() + (endDate.getTime() - startDate.getTime()) / 2);
            this.currentMonthForSummary = viewMiddle.toISOString();
            this.refreshCostSummary();
        } catch (error) {
            console.error('날짜 설정 처리 오류:', error);
        }
    }

    handleInputChange(event) {
        try {
            const target = event.target;
            if (target && target.name) {
                this[target.name] = target.value || '';
            }
        } catch (error) {
            console.error('입력 변경 처리 오류:', error);
        }
    }

    handleCostChange(event) {
        try {
            const target = event.target;
            if (!target || !target.dataset || !target.dataset.id) {
                console.warn('비용 변경 이벤트에 필요한 데이터가 없습니다');
                return;
            }

            const itemId = parseInt(target.dataset.id, 10);
            const { name, value } = target;
            
            if (isNaN(itemId) || !name) {
                console.warn('잘못된 비용 아이템 ID 또는 필드명:', itemId, name);
                return;
            }

            this.costItems = (this.costItems || []).map(item =>
                item.id === itemId ? { ...item, [name]: value } : item
            );
        } catch (error) {
            console.error('비용 변경 처리 오류:', error);
        }
    }

    addCostItem() {
        try {
            const newId = (this.costItems || []).length;
            this.costItems = [...(this.costItems || []), {
                id: newId,
                type: '',
                amount: null
            }];
        } catch (error) {
            console.error('비용 아이템 추가 오류:', error);
        }
    }

    // === 캘린더 업데이트 ===
    updateCalendarView(savedEventId) {
        try {
            const calendarView = this.template.querySelector('c-calendar-view');
            if (!calendarView) {
                console.warn('캘린더 뷰를 찾을 수 없습니다');
                return;
            }

            const eventData = {
                title: this.eventTitle || 'Untitled Event',
                start: this.eventStartDate || '',
                end: addOneDay(this.eventEndDate || this.eventStartDate || ''),
                allDay: true
            };

            if (this.recordId) {
                calendarView.updateEvent(this.recordId, eventData);
            } else if (savedEventId) {
                calendarView.addEvent({
                    id: savedEventId,
                    ...eventData
                });
            }
        } catch (error) {
            console.error('캘린더 뷰 업데이트 오류:', error);
        }
    }

    refreshCostSummary() {
        try {
            const costSummaryPanel = this.template.querySelector('c-cost-summary-panel');
            if (costSummaryPanel) {
                costSummaryPanel.updateMonth(this.currentMonthForSummary);
                costSummaryPanel.refreshSummary();
            }
        } catch (error) {
            console.error('비용 요약 새로고침 오류:', error);
        }
    }

    // === 모달 관리 ===
    openModal() {
        this.isModalOpen = true;
    }

    closeModal() {
        try {
            this.isModalOpen = false;
            this.recordId = null;
            this.eventTitle = '';
            this.eventStartDate = '';
            this.eventEndDate = '';
            this.eventDescription = '';
            this.eventLocation = '';
            this.eventDepartment = '';
            this.costItems = [];
            this.newEventData = { extendedProps: {} };
        } catch (error) {
            console.error('모달 닫기 오류:', error);
        }
    }

    // === Toast 메시지 ===
    showToast(title, message, variant) {
        try {
            this.dispatchEvent(new ShowToastEvent({ 
                title: title || '알림', 
                message: message || '', 
                variant: variant || 'info' 
            }));
        } catch (error) {
            console.error('Toast 표시 오류:', error);
        }
    }
}