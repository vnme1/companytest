/**
 * @description       : 
 * @author            : sejin.park@dkbmc.com
 * @group             : 
 * @last modified on  : 2025-07-17
 * @last modified by  : sejin.park@dkbmc.com
**/
import { LightningElement, wire } from 'lwc';
import { loadScript } from 'lightning/platformResourceLoader';
import FullCalendar from '@salesforce/resourceUrl/FullCalendarV5_new';

import getAccountList from '@salesforce/apex/CalendarAppController.getAccountList';
import getContactList from '@salesforce/apex/CalendarAppController.getContactList';
import getOpportunityList from '@salesforce/apex/CalendarAppController.getOpportunityList';

export default class EventSourcePanel extends LightningElement {
    fullCalendarInitialized = false;

    @wire(getAccountList) wiredAccounts;
    @wire(getContactList) wiredContacts;
    @wire(getOpportunityList) wiredOpportunities;

    get accountData() { 
        return this.wiredAccounts.data || []; 
    }
    
    get contactData() { 
        return this.wiredContacts.data || []; 
    }
    
    get opportunityData() { 
        return this.wiredOpportunities.data || []; 
    }
    
    renderedCallback() {
        if (this.fullCalendarInitialized) {
            return;
        }
        
        loadScript(this, FullCalendar + '/main.min.js')
            .then(() => {
                this.fullCalendarInitialized = true;
                // 초기 드래그 설정
                this.initializeExternalDraggables();
            })
            .catch(error => { 
                console.error('Error loading FullCalendar:', error); 
            });
    }

    // 탭 변경 시 드래그 재설정
    handleTabActive() {
        // 렌더링 후 드래그 설정
        setTimeout(() => {
            this.initializeExternalDraggables();
        }, 100);
    }
    
    initializeExternalDraggables() {
        if (!this.fullCalendarInitialized || !window.FullCalendar) {
            return;
        }

        try {
            // 기존 드래그 설정 제거
            const containers = this.template.querySelectorAll('.salesforce-components-section, .personal-activity-section');
            containers.forEach(container => {
                if (container._fcDraggable) {
                    container._fcDraggable.destroy();
                    delete container._fcDraggable;
                }
            });

            // Salesforce 구성요소 드래그 설정
            const salesforceContainer = this.template.querySelector('.salesforce-components-section');
            if (salesforceContainer) {
                const salesforceDraggable = new window.FullCalendar.Draggable(salesforceContainer, {
                    itemSelector: '.table-row',
                    eventData: function(eventEl) {
                        return {
                            title: eventEl.dataset.recordName,
                            extendedProps: {
                                relatedId: eventEl.dataset.recordId,
                                recordType: eventEl.dataset.recordType,
                                accountName: eventEl.dataset.accountName || ''
                            }
                        };
                    }
                });
                salesforceContainer._fcDraggable = salesforceDraggable;
            }

            // 개인 활동 드래그 설정
            const activityContainer = this.template.querySelector('.personal-activity-section');
            if (activityContainer) {
                const activityDraggable = new window.FullCalendar.Draggable(activityContainer, {
                    itemSelector: '.activity-item',
                    eventData: function(eventEl) {
                        return {
                            title: eventEl.dataset.recordName,
                            extendedProps: {
                                relatedId: eventEl.dataset.recordId,
                                recordType: eventEl.dataset.recordType,
                                accountName: eventEl.dataset.accountName || ''
                            }
                        };
                    }
                });
                activityContainer._fcDraggable = activityDraggable;
            }

            console.log('External draggables initialized successfully');
        } catch (error) {
            console.error('Error initializing draggables:', error);
        }
    }

    // 컴포넌트 해제 시 드래그 정리
    disconnectedCallback() {
        const containers = this.template.querySelectorAll('.salesforce-components-section, .personal-activity-section');
        containers.forEach(container => {
            if (container._fcDraggable) {
                container._fcDraggable.destroy();
                delete container._fcDraggable;
            }
        });
    }
}