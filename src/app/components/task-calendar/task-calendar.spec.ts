import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { TaskCalendarComponent } from './task-calendar';

describe('TaskCalendarComponent', () => {
  let component: TaskCalendarComponent;
  let fixture: ComponentFixture<TaskCalendarComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [TaskCalendarComponent],
      providers: [provideRouter([])],
    }).compileComponents();

    fixture = TestBed.createComponent(TaskCalendarComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
