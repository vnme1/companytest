/**
 * @description       : 이벤트 소스 패널 - async/await 일관성 적용
 * @author            : sejin.park@dkbmc.com
 * @group             : 
 * @last modified on  : 2025-07-23
 * @last modified by  : sejin.park@dkbmc.com
**/
import { LightningElement, wire } from 'lwc';
import { loadScript } from 'lightning/platformResourceLoader';

// static resource
import FullCalendar from '@salesforce/resourceUrl/FullCalendarV5_new';

// apex 메소드
import getAccountList from '@salesforce/apex/CalendarAppController.getAccountList';
import getContactList from '@salesforce/apex/CalendarAppController.getContactList';
import getOpportunityList from '@salesforce/apex/CalendarAppController.getOpportunityList';

export default class EventSourcePanel extends LightningElement {
    fullCalendarInitialized = false;
    
    @wire(getAccountList) wiredAccounts;
    @wire(getContactList) wiredContacts;
    @wire(getOpportunityList) wiredOpportunities;

    // --생명주기 메소드--
    // Fullcalendar 로드 후 드래그 기능 초기화
    async renderedCallback() {
        if (this.fullCalendarInitialized) return;
        
        try {
            await loadScript(this, FullCalendar + '/main.min.js');
            this.fullCalendarInitialized = true;
            this.initializeExternalDraggables();
        } catch (error) {
            console.error('FullCalendar 로드 실패:', error);
        }
    }

    // 컴포넌트 해제시 드래그 인스턴스 정리
    disconnectedCallback() {
        try {
            this.cleanupExistingDraggables();
        } catch (error) {
            console.error('컴포넌트 해제 시 정리 오류:', error);
        }
    }

    // --Getters--
    get accountData() { 
        try {
            return this.wiredAccounts?.data || [];
        } catch (error) {
            console.error('Account 데이터 조회 오류:', error);
            return [];
        }
    }
    
    get contactData() { 
        try {
            return this.wiredContacts?.data || [];
        } catch (error) {
            console.error('Contact 데이터 조회 오류:', error);
            return [];
        }
    }
    
    get opportunityData() { 
        try {
            return this.wiredOpportunities?.data || [];
        } catch (error) {
            console.error('Opportunity 데이터 조회 오류:', error);
            return [];
        }
    }
    
    // --드래그 설정--
    // 드래그 가능한 요소들 초기화
    initializeExternalDraggables() {
        try {
            if (!this.fullCalendarInitialized || !window.FullCalendar) {
                console.warn('FullCalendar가 초기화되지 않았습니다.');
                return;
            }

            this.cleanupExistingDraggables();
            this.createDraggables();
        } catch (error) {
            console.error('드래그 초기화 실패:', error);
        }
    }

    // 기존 드래그 인스턴스 정리
    cleanupExistingDraggables() {
        try {
            const containers = this.template.querySelectorAll('.salesforce-components-section, .personal-activity-section');
            
            containers.forEach(container => {
                try {
                    if (container._fcDraggable) {
                        container._fcDraggable.destroy();
                        delete container._fcDraggable;
                    }
                } catch (cleanupError) {
                    console.error('드래그 인스턴스 정리 오류:', cleanupError);
                }
            });
        } catch (error) {
            console.error('기존 드래그 인스턴스 정리 오류:', error);
        }
    }

    // 새로운 드래그 인스턴스들 생성
    createDraggables() {
        try {
            const salesforceContainer = this.template.querySelector('.salesforce-components-section');
            if (salesforceContainer) {
                try {
                    salesforceContainer._fcDraggable = new window.FullCalendar.Draggable(salesforceContainer, {
                        itemSelector: '.table-row',
                        eventData: this.getEventData.bind(this)
                    });
                } catch (error) {
                    console.error('Salesforce 컨테이너 드래그 생성 오류:', error);
                }
            }

            const activityContainer = this.template.querySelector('.personal-activity-section');
            if (activityContainer) {
                try {
                    activityContainer._fcDraggable = new window.FullCalendar.Draggable(activityContainer, {
                        itemSelector: '.activity-item',
                        eventData: this.getEventData.bind(this)
                    });
                } catch (error) {
                    console.error('활동 컨테이너 드래그 생성 오류:', error);
                }
            }
        } catch (error) {
            console.error('드래그 인스턴스 생성 오류:', error);
        }
    }

    //드래그된 요소의 이벤트 데이터 생성
    getEventData(eventEl) {
        try {
            if (!eventEl || !eventEl.dataset) {
                console.warn('이벤트 요소 또는 데이터셋이 없습니다.');
                return null;
            }

            const { recordName, recordId, recordType, accountName } = eventEl.dataset;

            if (!recordName) {
                console.warn('레코드 이름이 없습니다.');
                return null;
            }

            return {
                title: recordName,
                extendedProps: {
                    relatedId: recordId || '',
                    recordType: recordType || '',
                    accountName: accountName || ''
                }
            };
        } catch (error) {
            console.error('이벤트 데이터 생성 오류:', error);
            return null;
        }
    }

    // --이벤트 처리--
    async handleTabActive() {
        try {
            // DOM 재렌더링 대기 후 드래그 기능 재초기화
            // eslint-disable-next-line @lwc/lwc/no-async-operation
            setTimeout(() => {
                this.initializeExternalDraggables();
            }, 100);
        } catch (error) {
            console.error('탭 활성화 처리 오류:', error);
        }
    }
    
    

    

    
}