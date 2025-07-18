/**
 * @description       : 
 * @author            : sejin.park@dkbmc.com
 * @group             : 
 * @last modified on  : 2025-07-18
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
                this.initializeExternalDraggables();
            })
            .catch(error => {});
    }

    handleTabActive() {
        setTimeout(() => {
            this.initializeExternalDraggables();
        }, 100);
    }
    
    initializeExternalDraggables() {
        if (!this.fullCalendarInitialized || !window.FullCalendar) {
            return;
        }

        try {
            const containers = this.template.querySelectorAll('.salesforce-components-section, .personal-activity-section');
            containers.forEach(container => {
                if (container._fcDraggable) {
                    container._fcDraggable.destroy();
                    delete container._fcDraggable;
                }
            });

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
        } catch (error) {}
    }

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