import { ComponentFixture, TestBed } from '@angular/core/testing';
import { NodeEditor } from './node-editor';

describe('NodeEditor', () => {
  let component: NodeEditor;
  let fixture: ComponentFixture<NodeEditor>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [NodeEditor],
    }).compileComponents();

    fixture = TestBed.createComponent(NodeEditor);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
